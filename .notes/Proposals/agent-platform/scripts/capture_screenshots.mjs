#!/usr/bin/env node
// Captures the demo screenshots used on the proposal pages, at 1920 by 1080.
//
//   node capture_screenshots.mjs            one whole incident, start to finish
//   node capture_screenshots.mjs --probe    sign in and capture the pages as they are;
//                                           runs no task and changes nothing in the cluster
//   node capture_screenshots.mjs --kagent   the kagent console only (files 22 to 26); changes nothing
//
// It drives the real pages of the demo's kind cluster in headless Chrome, with a
// separate browser session for each role, so that the three sign-ins do not share
// one identity provider session. The whole run does `task demo:reset`, then
// `task demo:break`, clicks through propose, refused apply, approve and apply, and
// captures the kagent console and ends with `task demo:reset`, also when a step fails.
// PNG files go to ../screenshots; the text each page
// showed at every step, and the output of the two refusal drills, go to a log
// directory for whoever writes the captions.
//
// Needs the demo up with `task demo:preflight` all GO, Google Chrome, and
// playwright-core:
//
//   DEMO_REPO         the demo repository (default: ../../../agentgateway-demo)
//   PLAYWRIGHT_FROM   a directory whose node_modules holds playwright-core
//                     (default: $DEMO_REPO/.scratch/final/rehearsal)
//   CAPTURE_LOG_DIR   where the text logs go (default: /tmp/proposal-screenshots)
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(process.env.DEMO_REPO || path.join(HERE, '../../../agentgateway-demo'));
const OUT = path.resolve(HERE, '../screenshots');
const LOGS = path.resolve(process.env.CAPTURE_LOG_DIR || '/tmp/proposal-screenshots');
const PROBE = process.argv.includes('--probe');
const KAGENT = process.argv.includes('--kagent');
const VIEW = { width: 1920, height: 1080 };

const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_FROM || path.join(REPO, '.scratch/final/rehearsal'), 'x.js'))('playwright-core');

const URLS = {
  search: 'http://localhost:18082/search?q=red',
  chat: 'http://localhost:18083/',
  kagent: 'http://localhost:18087/',
  registry: 'http://localhost:18086/',
  sampleApp: 'http://localhost:18084/d/sample-app?refresh=5s&kiosk',
  // The two gateway dashboards over the last ten minutes: this incident and nothing before it.
  platform: 'http://localhost:18084/d/platform-overview?from=now-10m&to=now&refresh=10s&kiosk',
  gateway: 'http://localhost:18084/d/agentgateway?from=now-10m&to=now&refresh=10s&kiosk',
  // Model calls of the last 30 minutes that returned tokens (a call the provider refused has none).
  langfuse: 'http://localhost:18085/project/agentgateway-demo/traces?filter=type%3BstringOptions%3B%3Bany+of%3BGENERATION%2CtotalTokens%3Bnumber%3B%3B%3E%3B0&dateRange=30m',
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const log = (...parts) => console.log(`${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s`, ...parts);
const problems = [];
const problem = (what) => { problems.push(what); log('PROBLEM', what); };

function task(args, timeout = 300000) {
  return new Promise((resolve) => {
    execFile('mise', ['exec', '--', 'task', ...args], { cwd: REPO, timeout, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, out: stdout + stderr });
    });
  });
}
const kubectl = (...args) => execFileSync('mise', ['exec', '--', 'kubectl', '--kubeconfig', path.join(REPO, 'local/kind/kubeconfig'), '--context', 'kind-agentgateway-demo', ...args], { cwd: REPO, encoding: 'utf8' });
const secret = (namespace, name, key) => Buffer.from(kubectl('-n', namespace, 'get', 'secret', name, '-o', `jsonpath={.data.${key}}`), 'base64').toString();

// A screenshot of what the viewer sees, and the page's text beside it in the log directory.
async function shot(page, name, settle = 500) {
  await sleep(settle);
  try {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    fs.writeFileSync(path.join(LOGS, `${name}.txt`), await page.locator('body').innerText());
    log('shot', name);
  } catch (error) { problem(`${name}: ${String(error).split('\n')[0]}`); }
}

// Wait until check() holds. A wait that runs out is noted, and the run carries on.
async function until(what, check, limit = 60000, every = 200, quiet = false) {
  const from = Date.now();
  for (;;) {
    try { if (await check()) { log(`${what}: ${((Date.now() - from) / 1000).toFixed(1)}s`); return true; } } catch { /* the page is busy */ }
    if (Date.now() - from > limit) { if (quiet) log(`${what}: not within ${limit / 1000}s, carrying on`); else problem(`${what}: not within ${limit / 1000}s`); return false; }
    await sleep(every);
  }
}
// The same, for a wait that only makes a picture better: running out is not a problem.
const settle = (what, check, limit) => until(what, check, limit, 300, true);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const session = async () => (await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })).newPage();

async function chatAs(user) {
  const page = await session();
  await page.goto(URLS.chat);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForURL(/18081/);
  await page.fill('#username', user);
  await page.fill('#password', 'demo');
  await page.click('#kc-login');
  await page.getByText('Signed in as').waitFor({ timeout: 20000 });
  log('signed in as', user);
  return page;
}
const card = (page) => page.getByRole('main', { name: 'Incident' });
const cardText = (page) => card(page).innerText();
const button = (page, name) => card(page).getByRole('button', { name });
const chatLog = (page) => page.locator('body').innerText();

async function grafana(page, url, text) {
  await page.goto(url);
  await sleep(1500);
  if (/\/login/.test(page.url())) {
    await page.fill('input[name=user]', 'admin');
    await page.fill('input[name=password]', secret('telemetry', 'kube-prometheus-stack-grafana', 'admin-password'));
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/d\//, { timeout: 20000 });
  }
  await page.getByText(text).first().waitFor({ timeout: 30000 });
}
const searchSuccess = async (page) => {
  const match = (await page.locator('body').innerText()).match(/Search success, last 30 seconds\s*\n\s*([\d.]+)%/);
  return match ? parseFloat(match[1]) : null;
};

// Langfuse: the table of model calls, with the columns that tell the story.
async function langfuse(page) {
  await page.goto(URLS.langfuse);
  await sleep(2500);
  if (/sign-in/.test(page.url())) {
    await page.fill('input[name=email]', secret('langfuse', 'langfuse-init', 'LANGFUSE_INIT_USER_EMAIL'));
    if (!(await page.locator('input[name=password]').count())) {
      await page.getByRole('button', { name: /continue/i }).click();
      await page.locator('input[name=password]').waitFor();
    }
    await page.fill('input[name=password]', secret('langfuse', 'langfuse-init', 'LANGFUSE_INIT_USER_PASSWORD'));
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/project\/|localhost:18085\/?$/, { timeout: 30000 });
    await page.goto(URLS.langfuse);
  }
  await page.locator('tbody tr').first().waitFor({ timeout: 30000 });
  try {
    await page.getByRole('button', { name: /Columns/ }).click();
    const panel = page.locator('[role=dialog], [data-radix-popper-content-wrapper]').last();
    const state = (id) => panel.locator(`#col-${id}`).getAttribute('data-state', { timeout: 1500 }).catch(() => null);
    const want = { input: false, output: false, metadata: false, level: false, timeToFirstToken: false, promptName: false, environment: false, traceTags: false, userId: true };
    for (const [id, on] of Object.entries(want)) {
      const now = await state(id);
      if (now !== null && (now === 'checked') !== on) await panel.locator(`label[for="col-${id}"]`).click({ timeout: 2000 });
    }
    await panel.getByRole('button', { name: /Usage/ }).first().click({ timeout: 2000 });
    await sleep(300);
    if ((await state('totalTokens')) !== 'checked') await panel.locator('label[for="col-totalTokens"]').click({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await sleep(600);
    await page.getByRole('button', { name: 'Hide filters' }).click({ timeout: 3000 });
  } catch (error) { problem(`Langfuse columns: ${String(error).split('\n')[0]}`); await page.keyboard.press('Escape').catch(() => {}); }
  await sleep(800);
}

// Three pictures of Langfuse: the table, the cost of the largest call, and one call opened.
// `since` is when Apply was clicked; the table is complete once its newest row is later.
async function langfusePictures(page, names, since = 0) {
  await langfuse(page);
  const rows = page.locator('tbody tr');
  const newest = async () => {
    const stamp = (await rows.first().innerText()).match(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/);
    return stamp ? new Date(stamp[0].replace(' ', 'T')).getTime() : 0;
  };
  if (since) {
    await until('Langfuse lists the call made after Apply', async () => {
      await page.reload();
      await rows.first().waitFor({ timeout: 20000 });
      await sleep(1500);
      return (await newest()) >= since - 2000;
    }, 90000, 4000);
  }
  await shot(page, names[0], 1500);
  try {
    // The third row from the top is the diagnosis agent's last and largest call.
    const cost = rows.nth(2).getByText(/^\$\d/).first();
    await cost.hover();
    await sleep(1200);
    if (!(await page.getByText('Cost breakdown').count())) await cost.click();
    await page.getByText('Cost breakdown').first().waitFor({ timeout: 5000 });
    await shot(page, names[1], 600);
    await page.keyboard.press('Escape');
    await page.mouse.move(960, 900);
    await sleep(600);
    // The second row is the call made for the incident manager: a short prompt and the draft it returned.
    await rows.nth(1).getByText(/^POST /).first().click();
    await shot(page, names[2], 4000);
  } catch (error) { problem(`Langfuse pictures: ${String(error).split('\n')[0]}`); }
}

// The kagent console, which lets in the platform engineer only. Five pages are read and nothing
// is changed. No chat is started: a chat from this console reaches the agent through kagent's
// controller and not through the gateway.
async function kagentPictures() {
  const page = await session();
  const menu = (name) => page.getByRole('link', { name, exact: true }).first();
  // The sign-in proxy sends the browser to the identity provider, and the console then asks to continue.
  const form = page.locator('#username');
  const proceed = page.getByRole('button', { name: 'Continue' });
  await page.goto(URLS.kagent, { waitUntil: 'domcontentloaded' });
  await form.or(proceed).or(menu('Agents')).first().waitFor({ timeout: 20000 });
  if (await form.count()) {
    await page.fill('#username', 'platform-engineer');
    await page.fill('#password', 'demo');
    await page.click('#kc-login');
  }
  await proceed.or(menu('Agents')).first().waitFor({ timeout: 20000 });
  if (await proceed.count()) await proceed.click();
  await menu('Agents').waitFor({ timeout: 20000 });
  log('signed in to the kagent console');

  await menu('Agents').click();
  await page.getByText(/\d+ conversations/).first().waitFor({ timeout: 20000 });
  await shot(page, '22-kagent-agents', 1200);

  // The agent's own page: its template, harness, revision, model and tools, and who started each conversation.
  await page.getByText('diagnosis-agent', { exact: true }).first().click();
  await page.getByText('Agent Details', { exact: true }).first().click();
  await page.getByText('Started by').first().waitFor({ timeout: 20000 });
  await shot(page, '23-kagent-agent-details', 1500);

  // Reached by its link: a direct request for /mcp is answered by the controller's own MCP endpoint.
  await menu('MCP Servers').click();
  await page.getByText(/\d+ of \d+ servers/).waitFor({ timeout: 20000 });
  await page.getByRole('row', { name: /diagnosis-agent-kubernetes/ }).getByRole('button').first().click().catch(() => problem('kagent: the tool server row did not expand'));
  await shot(page, '24-kagent-tool-servers', 2500);

  await menu('Models').click();
  await page.getByText(/\d+ of \d+ configurations/).waitFor({ timeout: 20000 });
  await shot(page, '25-kagent-models', 1200);

  await menu('Substrate').click();
  await page.getByText('Actor templates').first().waitFor({ timeout: 20000 });
  await shot(page, '26-kagent-substrate', 2500);
}

// The Agentgateway dashboard opens on its Overview and Requests rows; the story is in LLM and MCP.
async function gatewayRows(page) {
  try {
    await page.getByRole('button', { name: 'Collapse row' }).first().waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Collapse row' }).first().click(); await sleep(400);
    await page.getByRole('button', { name: 'Collapse row' }).first().click(); await sleep(600);
    await page.getByRole('button', { name: 'Expand row' }).nth(3).click(); await sleep(400);
    await page.getByRole('button', { name: 'Expand row' }).nth(2).click(); await sleep(400);
    await page.getByText('Token Consumption').first().waitFor({ timeout: 15000 });
  } catch (error) { problem(`Agentgateway dashboard rows: ${String(error).split('\n')[0]}`); }
  await sleep(2500);
}

let broken = false; // true from `task demo:break` on: the run must end with a reset, whatever happens
async function run() {
  if (!PROBE) {
    log('task demo:reset');
    const reset = await task(['demo:reset']);
    if (reset.code) throw new Error(`demo:reset failed: ${reset.out.slice(-400)}`);
    const preflight = await task(['demo:preflight']);
    fs.writeFileSync(path.join(LOGS, 'preflight.txt'), preflight.out);
    if (/NO-GO\s+Model answers/.test(preflight.out)) throw new Error('the model does not answer through the gateway; see preflight.txt');
  }

  // ---- before the incident -------------------------------------------------
  const search = await session();
  await search.goto(URLS.search);
  await search.getByText(/records indexed/).waitFor({ timeout: 20000 });
  await shot(search, '01-sample-app-search-healthy');

  const registry = await session();
  await registry.goto(URLS.registry);
  await registry.getByText('Delivery MCP').first().waitFor({ timeout: 20000 });
  await shot(registry, '02-registry-tool-servers');
  await registry.locator('button:has-text("Agents")').first().click();
  await shot(registry, '03-registry-agents', 900);

  const developer = await chatAs('developer');
  const manager = await chatAs('incident-manager');
  const engineer = await chatAs('platform-engineer');
  await developer.getByText('No incident right now.').waitFor({ timeout: 15000 }).catch(() => problem('the developer\'s page does not say "No incident right now."'));
  await shot(developer, '04-chat-no-incident');

  const dashboards = await session();
  await grafana(dashboards, URLS.sampleApp, /Search success/);

  if (PROBE) {
    await shot(dashboards, 'probe-grafana-sample-app', 2500);
    await grafana(dashboards, URLS.platform, 'Requests refused');
    await shot(dashboards, 'probe-grafana-platform-overview', 3000);
    await dashboards.goto(URLS.gateway);
    await gatewayRows(dashboards);
    await shot(dashboards, 'probe-grafana-agentgateway');
    await langfusePictures(await session(), ['probe-langfuse-model-calls', 'probe-langfuse-cost-breakdown', 'probe-langfuse-model-call-detail']);
  } else {
    // ---- the release that breaks search --------------------------------------
    log('task demo:break');
    const broke = await task(['demo:break']);
    fs.writeFileSync(path.join(LOGS, 'break.txt'), broke.out);
    if (broke.code) throw new Error(`demo:break failed: ${broke.out.slice(-400)}`);
    broken = true;
    await until('search page says unavailable', async () => /is unavailable/.test(await search.getByRole('alert').first().innerText()) && /cannot be shown/.test(await search.locator('body').innerText()), 30000);
    await settle('search page names the new version', async () => /search-service\s*2\.1\.0/.test(await search.locator('body').innerText()), 8000);
    await shot(search, '05-sample-app-search-unavailable');

    // ---- the card appears, then the diagnosis ---------------------------------
    await until('incident card appears', async () => !/No incident right now/.test(await cardText(developer)) && /Suspected cause/i.test(await cardText(developer)), 90000);
    if (/Diagnosing…/.test(await cardText(developer))) await shot(developer, '07-chat-card-diagnosing', 300);
    else problem('the card was never seen in its "Diagnosing…" state');
    await settle('Grafana: search success under 40%', async () => { const value = await searchSuccess(dashboards); return value !== null && value < 40; }, 20000);
    await shot(dashboards, '06-grafana-sample-app-failing', 1200);
    let failed = '';
    await until('diagnosis on the card', async () => {
      const text = await cardText(developer);
      failed = (text.match(/Diagnosis failed[^\n]*/) || [''])[0];
      return Boolean(failed) || (!/Diagnosing…/.test(text) && await button(developer, /Propose rollback to \d/).isEnabled());
    }, 90000);
    if (failed) throw new Error(`the card says: ${failed}`);
    await shot(developer, '08-chat-developer-diagnosis', 1000);

    // ---- propose ---------------------------------------------------------------
    await button(developer, /Propose rollback to \d/).click();
    await until('proposal on the card', async () => /Waiting for approval/.test(await cardText(developer)), 30000);
    await shot(developer, '09-chat-developer-proposed', 1500);
    fs.writeFileSync(path.join(LOGS, 'drill-refused-by-gateway.txt'), (await task(['demo:backup:refused-by-gateway'])).out);

    // ---- apply before approval: the service refuses ----------------------------
    await until('engineer sees the proposal', async () => /Not approved yet/.test(await cardText(engineer)), 20000);
    await button(engineer, /Apply rollback to \d/).click();
    await until('refusal on the card', async () => /Refused by the service/.test(await cardText(engineer)), 20000);
    await shot(engineer, '10-chat-engineer-refused-by-service', 1000);
    fs.writeFileSync(path.join(LOGS, 'drill-refused-by-service.txt'), (await task(['demo:backup:refused-by-service'])).out);

    // ---- the incident manager drafts a status update and approves --------------
    await until('manager sees the proposal', async () => /Waiting for you/.test(await cardText(manager)), 20000);
    await button(manager, 'Draft status update').click();
    await until('status draft written', async () => (await card(manager).locator('textarea').first().inputValue()).trim().length > 40, 60000);
    await shot(manager, '11-chat-manager-status-draft', 1000);
    await button(manager, /Approve rollback to \d/).click();
    await until('approval on the card', async () => /Ready to apply/.test(await cardText(manager)), 30000);
    await shot(manager, '12-chat-manager-approved', 1500);

    // ---- apply, verify, resolved -----------------------------------------------
    await until('engineer may apply', async () => /Ready for you to apply/.test(await cardText(engineer)), 20000);
    await button(engineer, /Apply rollback to \d/).click();
    const applied = Date.now();
    await shot(engineer, '13-chat-engineer-verifying', 2200);
    await until('search answers again', async () => (await fetch('http://localhost:18082/api/search?q=red')).status === 200, 90000, 500);
    await until('search page recovered', async () => {
      const alerts = search.getByRole('alert');
      return (await alerts.count()) === 0 || /is back/.test(await alerts.first().innerText());
    }, 30000);
    await shot(search, '15-sample-app-search-recovered', 300);
    await until('card resolved', async () => { const text = await cardText(engineer); return !/Mitigating/i.test(text) && /Resolved/i.test(text); }, 60000);
    await until('the result in words', async () => { const text = await chatLog(engineer); return /applied/i.test(text) && !/Working…/.test(text); }, 30000);
    await shot(engineer, '14-chat-engineer-resolved', 2500);
    log(`apply to resolved shot: ${((Date.now() - applied) / 1000).toFixed(1)}s`);

    // ---- what the platform recorded --------------------------------------------
    await until('Grafana: search success back over 90%', async () => { const value = await searchSuccess(dashboards); return value !== null && value >= 90; }, 90000, 500);
    await shot(dashboards, '16-grafana-sample-app-recovered', 1500);
    await langfusePictures(await session(), ['17-langfuse-model-calls', '18-langfuse-cost-breakdown', '19-langfuse-model-call-detail'], applied);
    await grafana(dashboards, URLS.platform, 'Requests refused');
    await shot(dashboards, '20-grafana-platform-overview', 4000);
    await dashboards.goto(URLS.gateway);
    await gatewayRows(dashboards);
    await shot(dashboards, '21-grafana-agentgateway');
    await kagentPictures();
  }
}
try {
  if (KAGENT) await kagentPictures();
  else await run();
} catch (error) {
  problem(`stopped: ${String(error).split('\n')[0]}`);
} finally {
  await browser.close();
  if (broken) {
    log('task demo:reset');
    const end = await task(['demo:reset']);
    if (end.code) problem(`final demo:reset failed: ${end.out.slice(-300)}`);
  }
}

fs.writeFileSync(path.join(LOGS, 'problems.txt'), problems.join('\n') + '\n');
log(problems.length ? `${problems.length} problem(s); see ${LOGS}/problems.txt` : 'done, no problems');
process.exit(problems.length ? 1 : 0);
