import { REFRESH_MS, every, getJson, reason, refreshStatus, report, stamp } from '/static/common.js';

const indexed = document.querySelector('#count-indexed');
const registrations = document.querySelector('#count-registrations');

function setCount(item, value) {
  const known = typeof value === 'number';
  const label = item.querySelector('.count-label');
  label.dataset.many ??= label.textContent;
  label.textContent = value === 1 ? label.dataset.one : label.dataset.many;
  item.classList.toggle('is-down', !known);
  item.querySelector('.count-value').textContent = known ? value.toLocaleString() : 'Unavailable';
}

every(REFRESH_MS, async () => {
  // The count comes through the search API itself, so it fails when search fails.
  const search = await getJson('/api/search?q=&limit=0').catch((error) => ({ error }));
  const searchOk = !search.error;
  setCount(indexed, searchOk ? search.indexed : null);

  const status = await refreshStatus(new Set(searchOk ? [] : ['search-service']));
  const registrationOk = typeof status?.registrations_today === 'number';
  setCount(registrations, registrationOk ? status.registrations_today : null);

  report('Search', searchOk, searchOk ? '' : `${reason('The search service', search.error)} This page retries every ${REFRESH_MS / 1000} seconds.`);
  report('Registration', registrationOk, `The registration service did not answer. This page retries every ${REFRESH_MS / 1000} seconds.`);
  if (searchOk && registrationOk) stamp();
});
