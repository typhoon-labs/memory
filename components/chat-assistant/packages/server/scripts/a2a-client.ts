/**
 * Walks the whole incident over A2A against a running chat assistant in stub
 * mode: fetches the card as each role, performs each action, and receives each
 * refusal. Prints a transcript and exits non-zero if anything is not as expected.
 *
 *   # terminal 1 (fresh state each start)
 *   DEV_TEST_ISSUER=1 STUB_DOWNSTREAMS=1 PORT=18193 npm run dev -w @chat-assistant/server
 *   # terminal 2
 *   npm run a2a-client -w @chat-assistant/server -- [--url http://localhost:18193] [--a2a-version 1.0|0.3] [--chat]
 *
 * Tokens come from the server's test issuer (DEV_TEST_ISSUER=1). `--chat` also
 * sends one chat message, which makes one or two real model calls.
 *
 * Against the real components run locally (their scripts/local.sh), pass
 *   --token-get 'http://127.0.0.1:18199/token/{identity}' --no-gateway
 * `--token-get` reads tokens from that issuer instead. `--no-gateway` says no
 * gateway is in the path, so a role that may not use a tool is refused by the
 * service (rule `role_required`) rather than by the gateway.
 *
 * Against the cluster, through the gateway, with tokens from Keycloak:
 *   --url http://localhost:18080/a2a/chat-assistant --token-cmd '<repo>/local/identity/token.sh {identity}'
 * `--token-cmd` runs that command for each identity and takes the token from
 * its output. The incident must be open, diagnosed and without a change
 * (`task demo:reset demo:break demo:alert`).
 */
import { execSync } from 'node:child_process';
import { A2aSession, type Reply } from './lib/a2a-session.js';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1]! : fallback;
};
const url = option('url', 'http://localhost:18193').replace(/\/+$/, '');
const version = option('a2a-version', '1.0') as '1.0' | '0.3';
const withChat = args.includes('--chat');
const tokenGet = option('token-get', '');
const tokenCmd = option('token-cmd', '');
const noGateway = args.includes('--no-gateway');

let failures = 0;
function check(what: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
const step = (title: string) => console.log(`\n== ${title}`);

async function token(subject: string): Promise<string> {
  if (tokenCmd) {
    // `subject` is one of this script's own literals, never input.
    return execSync(tokenCmd.replace('{identity}', subject), { encoding: 'utf8' }).trim();
  }
  if (tokenGet) {
    const res = await fetch(tokenGet.replace('{identity}', subject));
    if (!res.ok) throw new Error(`no token for ${subject}: HTTP ${res.status} from ${tokenGet}`);
    return (await res.text()).trim();
  }
  const machine = subject === 'alert-automation';
  const res = await fetch(`${url}/dev/issuer/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(
      machine ? { grant_type: 'client_credentials', client_id: subject } : { grant_type: 'password', username: subject, client_id: 'chat-ui' },
    ),
  });
  if (!res.ok) throw new Error(`no token for ${subject}: HTTP ${res.status}. Is the server running with DEV_TEST_ISSUER=1?`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const connect = async (who: string) => A2aSession.connect(url, await token(who), version);

function showCard(who: string, s: A2aSession) {
  const fact = (id: string) => s.text(`fact-${id}-value`);
  console.log(`   [${who}] "${s.text('title')}" ${fact('incident')} ${fact('service')} severity=${fact('severity')} status=${fact('status')} running=${fact('version')}`);
  console.log(`   [${who}] ${s.text('change')} | ${s.text('change-status')}`);
  console.log(`   [${who}] progress: ${[0, 1, 2, 3, 4].map((i) => s.text(`progress-${i}`)).join('  ')}`);
  for (const b of s.buttons()) {
    console.log(`   [${who}] button ${b.id}: "${b.label}" ${b.disabledBecause ? `(disabled: ${b.disabledBecause})` : '(enabled)'}`);
  }
}
const showReply = (who: string, r: Reply) => console.log(`   [${who}] ${r.state} via ${r.events.join(' > ') || 'message'}: ${r.text.replace(/\n/g, ' ')}`);

// ---------------------------------------------------------------------------
step(`Agent card at ${url}/.well-known/agent-card.json (A2A ${version})`);
const developer = await connect('developer');
const extension = developer.card.capabilities?.extensions?.[0];
console.log(`   name=${developer.card.name} interfaces=${developer.card.supportedInterfaces.map((i: any) => `${i.protocolBinding}/${i.protocolVersion}`).join(', ')}`);
check('declares the A2UI extension v0.9.1', extension?.uri === 'https://a2ui.org/a2a-extension/a2ui/v0.9.1', extension?.uri);
check('declares streaming', developer.card.capabilities?.streaming === true);
check(`client speaks A2A ${version}`, developer.client.protocolVersion === version, developer.client.protocolVersion);

step('A request without a token');
const anonymous = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check('is rejected with 401', anonymous.status === 401, `HTTP ${anonymous.status}`);

step('Alert hook (Alertmanager webhook as alert-automation)');
const hook = await fetch(`${url}/hooks/alert`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${await token('alert-automation')}` },
  body: JSON.stringify({
    version: '4',
    status: 'firing',
    alerts: [
      {
        status: 'firing',
        labels: { alertname: 'SearchErrorRateHigh', service: 'search-service', severity: 'critical' },
        annotations: { summary: 'Search requests are failing', impact: '100% of searches failing' },
      },
    ],
  }),
});
const hookBody = (await hook.json()) as { results: { outcome: string; incident_id?: string }[] };
console.log(`   HTTP ${hook.status} ${JSON.stringify(hookBody)}`);
check('one open incident per service', hook.status === 200 && ['opened', 'already_open'].includes(hookBody.results[0]?.outcome ?? ''));
const asHuman = await fetch(`${url}/hooks/alert`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${await token('developer')}` },
  body: '{"alerts":[]}',
});
check('a person cannot call the hook', asHuman.status === 403, `HTTP ${asHuman.status}`);

step('The card, as each role');
const manager = await connect('incident-manager');
const engineer = await connect('platform-engineer');
const outsider = await connect('developer-other-team');
for (const [who, s] of [['developer', developer], ['incident-manager', manager], ['platform-engineer', engineer]] as const) {
  const reply = await s.sync();
  console.log(`   [${who}] A2UI received: ${reply.a2ui.map((m) => Object.keys(m).find((k) => k !== 'version')).join(', ')}`);
  showCard(who, s);
}
const ids = (s: A2aSession) => s.buttons().map((b) => b.id).join(',');
check('developer has only Propose', ids(developer) === 'propose', ids(developer));
check('incident-manager has Approve, Reject and the status draft', ids(manager) === 'approve,reject,draft,post', ids(manager));
check('platform-engineer has Apply and Restart', ids(engineer) === 'apply,restart', ids(engineer));
check('Apply is disabled until approved', !!engineer.buttons().find((b) => b.id === 'apply')?.disabledBecause);
if (developer.text('fact-status-value') !== 'open' || developer.text('change-status') !== 'Change status: none') {
  console.log('\nThis walk needs a fresh incident. Restart the server (stub state is in memory) and run again.');
  process.exit(2);
}
const incidentId = developer.text('fact-incident-value');

step('Refusals');
let r = await developer.action('approve_change', { incident_id: incidentId, change_id: 'CHG-0001' });
showReply('developer sends approve_change', r);
if (noGateway) {
  check('refused by the service (no gateway in the path): role_required', r.state === 'REJECTED' && r.metadata.refusal?.layer === 'service' && r.metadata.refusal?.rule === 'role_required');
} else {
  check('refused by the gateway', r.state === 'REJECTED' && r.metadata.refusal?.layer === 'gateway' && r.text.startsWith('Refused by the gateway'));
}

await outsider.sync();
r = await outsider.click('propose');
showReply('developer-other-team clicks Propose', r);
check('refused by the service: team_owns_service', r.metadata.refusal?.layer === 'service' && r.metadata.refusal?.rule === 'team_owns_service');
check('the refusal is on the card', outsider.text('notice') === r.text);

step('developer proposes');
r = await developer.click('propose');
showReply('developer', r);
check('proposed', r.state === 'COMPLETED' && developer.text('change-status') === 'Change status: proposed');
await manager.sync();
const changeId = String(manager.component('approve')?.action.event.context.change_id ?? '');
check("the incident-manager's poll shows the proposal", manager.text('change-status') === 'Change status: proposed' && !!changeId, changeId);

step('platform-engineer tries to apply before approval');
await engineer.sync();
r = await engineer.action('apply_change', { incident_id: incidentId, change_id: changeId });
showReply('platform-engineer sends apply_change', r);
check('refused by the service, naming its rule', r.metadata.refusal?.layer === 'service' && !!r.metadata.refusal?.rule, r.metadata.refusal?.rule);

step('incident-manager rejects, then the developer proposes again');
manager.type('reject-reason', 'Please confirm 2.0.0 is still retained');
r = await manager.click('reject');
showReply('incident-manager', r);
check('rejected with the reason', manager.text('change').includes('Reason: Please confirm 2.0.0 is still retained'));
await developer.sync();
r = await developer.click('propose');
showReply('developer', r);
check('proposed again', r.state === 'COMPLETED');

step('incident-manager drafts and posts a status update, then approves');
await manager.sync();
r = await manager.click('draft');
showReply('incident-manager (comms-agent)', r);
const draft = String(manager.model().draft?.text ?? '');
console.log(`   draft: ${draft}`);
check('a draft came back and nothing was posted', r.state === 'COMPLETED' && draft.length > 0 && !manager.text('timeline').includes('Status update by'));
r = await manager.click('post');
showReply('incident-manager', r);
check('posted', r.state === 'COMPLETED' && manager.text('timeline').includes('Status update by'));
r = await manager.click('approve');
showReply('incident-manager', r);
check('approved', r.state === 'COMPLETED' && manager.text('change-status') === 'Change status: approved');

step('platform-engineer restarts, then applies (remediation-agent; the card streams while it works)');
await engineer.sync();
check('Apply is now enabled', !engineer.buttons().find((b) => b.id === 'apply')?.disabledBecause);
r = await engineer.click('restart');
showReply('platform-engineer', r);
check('restarted', r.state === 'COMPLETED');
r = await engineer.click('apply');
showReply('platform-engineer', r);
const statuses = r.a2ui
  .filter((m) => m.updateComponents)
  .map((m) => m.updateComponents.components.find((c: any) => c.id === 'change-status')?.text.replace('Change status: ', ''));
console.log(`   card pushed during the stream: ${statuses.join(' > ')}`);
check('applied and verified', r.state === 'COMPLETED');
check('the stream showed progress before the end', r.events.filter((e) => e === 'statusUpdate').length > 1, r.events.join(' > '));

step('Everyone sees the result');
for (const [who, s] of [['developer', developer], ['incident-manager', manager], ['platform-engineer', engineer]] as const) {
  await s.sync();
  showCard(who, s);
  check(`${who} sees resolved`, s.text('fact-status-value') === 'resolved' && s.text('progress-4').includes('Resolved'));
}

if (withChat) {
  step('Chat text (the Mastra agent; real model call)');
  r = await developer.chat('In one sentence: what was wrong and what fixed it?');
  showReply('developer', r);
  check('the model answered', r.state === 'COMPLETED' && r.text.length > 0, r.state);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
