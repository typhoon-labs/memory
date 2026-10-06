// Starts the services as child processes on free ports, from source.
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Lays search-service out the way its Dockerfile does: src/, then the files
// of releases/<version>/ on top. Returns the entry point.
export function assembleSearch(version) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `search-service-${version}-`));
  for (const item of ['package.json', 'lib', 'seed', 'search-service/src']) {
    cpSync(path.join(root, item), path.join(dir, item), { recursive: true });
  }
  cpSync(path.join(root, 'search-service/releases', version), path.join(dir, 'search-service/src'), { recursive: true });
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'search-service/src/server.js');
}

export const entry = {
  web: path.join(root, 'web/src/server.js'),
  registration: path.join(root, 'registration-service/src/server.js'),
  search: assembleSearch,
};

// Runs `node <file>` and waits until /healthz answers. `logs` collects the
// JSON lines the service writes to stdout.
export async function start(file, env = {}) {
  const port = env.PORT ?? (await freePort());
  const logs = [];
  const child = spawn(process.execPath, [file], {
    env: { PATH: process.env.PATH, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let buffered = '';
  child.stdout.on('data', (chunk) => {
    const lines = (buffered + chunk).split('\n');
    buffered = lines.pop();
    for (const line of lines) logs.push(JSON.parse(line));
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 5000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${file} exited with code ${child.exitCode}`);
    if (await fetch(`${url}/healthz`).then((response) => response.ok, () => false)) break;
    if (Date.now() > deadline) throw new Error(`${file} did not become healthy`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return {
    url,
    port,
    logs,
    async stop() {
      child.kill('SIGTERM');
      await exited;
    },
  };
}

// The value of one series from /metrics, or undefined. `labels` must all be present.
export async function metric(service, name, labels = {}) {
  const text = await fetch(`${service.url}/metrics`).then((response) => response.text());
  const wanted = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
  const line = text.split('\n').find((candidate) => {
    const [series] = candidate.split(' ');
    return (series === name || series.startsWith(`${name}{`)) && wanted.every((label) => series.includes(label));
  });
  return line === undefined ? undefined : Number(line.slice(line.lastIndexOf(' ') + 1));
}

// A stand-in OTLP/HTTP receiver that keeps every span it is sent.
export async function startCollector() {
  const spans = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.method === 'POST' && req.url === '/v1/traces' && req.headers['content-type'] === 'application/json') {
      for (const resource of JSON.parse(body).resourceSpans) {
        const attributes = Object.fromEntries(resource.resource.attributes.map(({ key, value }) => [key, Object.values(value)[0]]));
        for (const scope of resource.scopeSpans) for (const span of scope.spans) spans.push({ ...span, resource: attributes });
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    spans,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function until(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
