// Shared by the three pages: fetching, the banner, the service versions and
// the refresh loop that lets a page recover without a reload.

export const REFRESH_MS = 3000;

const banner = document.querySelector('#banner');
const down = new Map(); // what is unavailable right now -> why
let hideBanner;

for (const link of document.querySelectorAll('.site-header nav a')) {
  if (link.pathname === location.pathname) link.setAttribute('aria-current', 'page');
}

export const clock = (date = new Date()) => date.toLocaleTimeString([], { hour12: false });

export function stamp() {
  const time = document.querySelector('#updated');
  if (time) time.textContent = clock();
}

// Resolves with the JSON body, or rejects with an Error that has `.status`
// (undefined when there was no answer at all) and `.data`.
export async function getJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000), ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message ?? `HTTP ${response.status}`), { status: response.status, data });
  return data;
}

// A sentence for the banner, from an error thrown by getJson.
export function reason(subject, error) {
  const what = error.status ? `${subject} answered with an error (HTTP ${error.status})` : `${subject} did not answer`;
  return `${what}. Last attempt ${clock()}.`;
}

function showBanner(kind, title = '', detail = '') {
  clearTimeout(hideBanner);
  banner.hidden = !kind;
  banner.className = kind ? `banner is-${kind}` : 'banner';
  banner.querySelector('.banner-title').textContent = title;
  banner.querySelector('.banner-detail').textContent = detail;
  document.body.classList.toggle('is-down', kind === 'down');
  if (kind === 'up') hideBanner = setTimeout(showBanner, 6000);
}

// Pages report each thing they depend on ("Search", "Registration"). The red
// banner stays for as long as anything is down, and turns green for a few
// seconds when the last of them comes back.
export function report(name, ok, detail = '') {
  const wasDown = down.size > 0;
  if (ok) down.delete(name);
  else down.set(name, detail);

  if (down.size) {
    const [first, why] = down.entries().next().value;
    showBanner('down', `${first} is unavailable`, why);
  } else if (wasDown) {
    showBanner('up', `${name} is back`, `Recovered at ${clock()}.`);
  }
}

function versionBadge(service) {
  const badge = document.createElement('span');
  badge.className = service.version ? 'version' : 'version is-unknown';
  badge.textContent = service.version ?? 'unknown';
  return badge;
}

// Fills the services table (Home) or the one-line version list (other pages).
// `failing` names services that are up but whose requests fail.
export async function refreshStatus(failing = new Set()) {
  const status = await getJson('/api/status').catch(() => null);
  const services = status?.services ?? [];

  const table = document.querySelector('#services');
  if (table) {
    table.replaceChildren(
      ...services.map((service) => {
        const row = document.createElement('tr');
        const name = document.createElement('td');
        const version = document.createElement('td');
        const state = document.createElement('td');
        const bad = !service.up || failing.has(service.name);
        name.textContent = service.name;
        version.append(versionBadge(service));
        state.className = bad ? 'state is-down' : 'state';
        state.textContent = !service.up ? 'Not responding' : bad ? 'Failing' : 'Running';
        row.append(name, version, state);
        return row;
      }),
    );
  }

  const line = document.querySelector('#versions');
  if (line) line.textContent = services.map((service) => `${service.name} ${service.version ?? 'unknown'}`).join(', ');

  return status;
}

// Runs `task` now, then every `ms`, and again as soon as a hidden tab is shown.
// A slow run is not overlapped by the next one.
export function every(ms, task) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } finally {
      running = false;
    }
  };
  run();
  setInterval(run, ms);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });
}
