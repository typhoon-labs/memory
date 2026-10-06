#!/usr/bin/env node
// Steady search and registration traffic for the Sample App, sent to the
// `web` front door as a browser would. Needs Node 22+, no dependencies.
//
//   node traffic.mjs            steady, RATE requests per second
//   node traffic.mjs --peak     RATE x PEAK_MULTIPLIER (same as MODE=peak)
//
// Settings are environment variables, so the same script runs as a Deployment.
const env = process.env;

function fail(message) {
  console.error(`traffic: ${message}`);
  process.exit(2);
}

function number(name, fallback) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) fail(`${name} must be a number of 0 or more`);
  return value;
}

const target = (env.TARGET_URL || 'http://localhost:18082').replace(/\/+$/, '');
const mode = process.argv.includes('--peak') ? 'peak' : env.MODE || 'steady';
if (!['steady', 'peak'].includes(mode)) fail('MODE must be steady or peak');

const steadyRate = number('RATE', 2); // requests per second
const rate = mode === 'peak' ? steadyRate * number('PEAK_MULTIPLIER', 5) : steadyRate;
const registerShare = number('REGISTER_SHARE', 0.1); // of all requests
const zeroResultShare = number('ZERO_RESULT_SHARE', 0.05); // of searches
const reportSeconds = number('REPORT_SECONDS', 10);
const durationSeconds = number('DURATION_SECONDS', 0); // 0: until stopped
const maxInFlight = 200;

// Words the seed catalogue knows, one group per attribute. A search uses one
// word from each of one or two groups, so it always matches something; the
// searches that match nothing are the ZERO_RESULT_SHARE and no more.
// Another seed: QUERY_TERMS="a,b,c;x,y,z".
const termGroups = (env.QUERY_TERMS || 'red,orange,yellow,green,teal,blue,purple,pink,brown,grey;circle,square,triangle,diamond,pentagon,hexagon,octagon,star,oval,cross;tiny,small,medium,large,huge')
  .split(';')
  .map((group) => group.split(',').map((term) => term.trim()).filter(Boolean))
  .filter((group) => group.length);
if (!termGroups.length) fail('QUERY_TERMS has no words');

const pick = (list) => list[Math.floor(Math.random() * list.length)];
// One or two different groups, in random order.
const someGroups = () => [...termGroups].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.5 ? 1 : 2);
const log = (msg, fields = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', service: 'traffic', msg, ...fields }));

let window = newWindow();
let inFlight = 0;
let sequence = 0;

function newWindow() {
  return { sent: 0, ok: 0, failed: 0, skipped: 0, by_status: {}, total_ms: 0 };
}

function nextRequest() {
  sequence += 1;
  if (Math.random() < registerShare) {
    return {
      url: `${target}/api/register`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Visitor ${sequence}`, email: `visitor-${sequence}@example.test` }),
      },
    };
  }
  const q = Math.random() < zeroResultShare ? `nothing-${sequence}` : someGroups().map(pick).join(' ');
  return { url: `${target}/api/search?${new URLSearchParams({ q })}`, init: {} };
}

async function send() {
  if (inFlight >= maxInFlight) {
    window.skipped += 1; // the target is too slow to keep up: do not pile up requests
    return;
  }
  const { url, init } = nextRequest();
  const started = performance.now();
  const stats = window;
  inFlight += 1;
  stats.sent += 1;
  let status;
  try {
    const response = await fetch(url, { ...init, headers: { 'user-agent': 'sample-app-traffic', ...init.headers }, signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    status = String(response.status);
    if (response.ok) stats.ok += 1;
    else stats.failed += 1;
  } catch (err) {
    status = err.name === 'TimeoutError' ? 'timeout' : 'no_answer';
    stats.failed += 1;
  } finally {
    inFlight -= 1;
    stats.by_status[status] = (stats.by_status[status] ?? 0) + 1;
    stats.total_ms += performance.now() - started;
  }
}

function report() {
  const { total_ms: totalMs, ...stats } = window;
  window = newWindow();
  log('traffic', { mode, target, rate, ...stats, mean_ms: stats.sent ? Math.round(totalMs / stats.sent) : 0 });
}

function stop() {
  if (window.sent) report();
  process.exit(0);
}

log('starting', { mode, target, rate, register_share: registerShare, zero_result_share: zeroResultShare });
if (rate > 0) {
  // One timer tick may owe more than one request at high rates, so count what is due.
  const startedAt = performance.now();
  let due = 0;
  setInterval(() => {
    const shouldHaveSent = Math.floor(((performance.now() - startedAt) / 1000) * rate);
    for (; due < shouldHaveSent; due += 1) send();
  }, Math.max(5, Math.min(100, 1000 / rate)));
}
if (reportSeconds > 0) setInterval(report, reportSeconds * 1000);
if (durationSeconds > 0) setTimeout(stop, durationSeconds * 1000);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
