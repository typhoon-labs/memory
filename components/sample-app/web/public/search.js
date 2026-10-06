import { REFRESH_MS, every, getJson, reason, refreshStatus, report, stamp } from '/static/common.js';

const form = document.querySelector('#search-form');
const input = document.querySelector('#q');
const summaryLine = document.querySelector('#summary');
const indexed = document.querySelector('#indexed');
const matches = document.querySelector('#matches');
const results = document.querySelector('#results');
const chips = [...document.querySelectorAll('.chip')];

const plain = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
let latest = 0; // only the newest search may draw
let drawn = null; // what the grid shows now, so a refresh with the same answer does not redraw

function tile(record) {
  const item = document.createElement('li');
  const stage = document.createElement('span');
  const shape = document.createElement('span');
  const name = document.createElement('span');
  const id = document.createElement('span');

  item.className = 'result';
  stage.className = 'stage';
  shape.className = `shape shape-${plain(record.shape)} size-${plain(record.size)}`;
  shape.setAttribute('aria-hidden', 'true');
  if (/^#[0-9a-f]{6}$/i.test(record.hex)) shape.style.setProperty('--c', record.hex);
  name.className = 'result-name';
  name.textContent = record.name;
  id.className = 'result-id';
  id.textContent = record.id;

  stage.append(shape);
  item.append(stage, name, id);
  return item;
}

function summary({ query, count, results: shown }) {
  if (query && count === 0) return `No record matches “${query}”. Try a colour, a shape or a size.`;
  const first = count > shown.length ? ` Showing the first ${shown.length}.` : '';
  return query ? `${count} ${count === 1 ? 'match' : 'matches'} for “${query}”.${first}` : first.trim();
}

async function search() {
  const q = input.value.trim();
  const mine = ++latest;
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.q === q));
  history.replaceState(null, '', q ? `?${new URLSearchParams({ q })}` : location.pathname);

  try {
    const data = await getJson(`/api/search?${new URLSearchParams({ q })}`);
    if (mine !== latest) return;
    const key = JSON.stringify([data.query, data.count, data.results.map((record) => record.id)]);
    if (key !== drawn) {
      results.replaceChildren(...data.results.map(tile));
      drawn = key;
    }
    indexed.textContent = data.indexed.toLocaleString();
    matches.textContent = summary(data);
    summaryLine.hidden = false;
    report('Search', true);
    stamp();
  } catch (error) {
    if (mine !== latest) return;
    // Old results next to an error would read as "still working": remove them.
    summaryLine.hidden = true;
    results.replaceChildren();
    drawn = null;
    report('Search', false, `${reason('The search service', error)} This page retries every ${REFRESH_MS / 1000} seconds.`);
  }
}

let typing;
input.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(search, 200);
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
for (const chip of chips) {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.q;
    search();
  });
}

input.value = new URLSearchParams(location.search).get('q') ?? '';
every(REFRESH_MS, () => Promise.all([search(), refreshStatus()]));
