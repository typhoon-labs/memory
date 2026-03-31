import type { ParseResult } from './registry.js';

let patched = false;

export async function parsePdf(buffer: Buffer, _filename: string): Promise<ParseResult> {
  // pdfjs-dist's LoopbackPort calls structuredClone with { transfer }.
  // Bun detaches ArrayBuffers even when the clone fails, corrupting the
  // data. Strip the transfer option so buffers are deep-copied instead.
  if (!patched) {
    const orig = globalThis.structuredClone;
    globalThis.structuredClone = ((obj: unknown, opts?: StructuredSerializeOptions) => {
      if (opts?.transfer) return orig(obj);
      return orig(obj, opts);
    }) as typeof structuredClone;
    patched = true;
  }

  const { extractText, getMeta } = await import('unpdf');
  const data = new Uint8Array(buffer);

  const [textResult, metaResult] = await Promise.all([extractText(data, { mergePages: true }), getMeta(data)]);

  return {
    text: textResult.text,
    format: 'text',
    metadata: {
      title: (metaResult.info?.Title as string) || undefined,
      author: (metaResult.info?.Author as string) || undefined,
      pageCount: textResult.totalPages,
    },
  };
}
