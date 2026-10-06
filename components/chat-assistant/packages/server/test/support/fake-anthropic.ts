/**
 * A minimal stand-in for the Anthropic Messages API (`POST /v1/messages`).
 *
 * Tests use it so that no test spends the user's real model endpoint, and so
 * that they can assert which headers the chat assistant sent to the model
 * (in particular `Authorization: Bearer <caller token>`).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedModelCall {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export interface FakeAnthropic {
  url: string;
  calls: RecordedModelCall[];
  /** Replace the scripted replies. Each call consumes one; the last repeats. */
  script(replies: FakeReply[]): void;
  close(): Promise<void>;
}

export type FakeReply =
  | { text: string }
  | { toolUse: { name: string; input: Record<string, unknown> } }
  /** Answer with an HTTP error, as a gateway that refuses the model call would. */
  | { httpStatus: number }
  /** Answer nothing for this long: a model that is slow or hangs. */
  | { hangMs: number };

function sse(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function startFakeAnthropic(initial: FakeReply[] = [{ text: 'Hello from the fake model.' }]): Promise<FakeAnthropic> {
  const calls: RecordedModelCall[] = [];
  let replies = [...initial];

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"type":"error"}');
        return;
      }
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: req.url, headers: req.headers, body });
      const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
      if ('hangMs' in reply) {
        const timer = setTimeout(() => res.writeHead(504).end(), reply.hangMs);
        res.on('close', () => clearTimeout(timer));
        return;
      }
      if ('httpStatus' in reply) {
        res.writeHead(reply.httpStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'permission_error', message: 'model access denied for this caller' } }));
        return;
      }
      const id = `msg_fake_${calls.length}`;
      const usage = { input_tokens: 10, output_tokens: 5 };

      const content =
        'text' in reply
          ? [{ type: 'text', text: reply.text }]
          : [{ type: 'tool_use', id: `toolu_fake_${calls.length}`, name: reply.toolUse.name, input: reply.toolUse.input }];
      const stopReason = 'text' in reply ? 'end_turn' : 'tool_use';

      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ id, type: 'message', role: 'assistant', model: body.model, content, stop_reason: stopReason, stop_sequence: null, usage }),
        );
        return;
      }

      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      sse(res, 'message_start', {
        type: 'message_start',
        message: { id, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } },
      });
      if ('text' in reply) {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        // Two deltas, so a streaming consumer sees more than one chunk.
        const mid = Math.ceil(reply.text.length / 2);
        for (const piece of [reply.text.slice(0, mid), reply.text.slice(mid)]) {
          if (piece) sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } });
        }
      } else {
        sse(res, 'content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: `toolu_fake_${calls.length}`, name: reply.toolUse.name, input: {} },
        });
        sse(res, 'content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.toolUse.input) },
        });
      }
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } });
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    script(next) {
      replies = [...next];
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
