import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { entry, metric, start, until } from './helpers.js';

describe('registration-service', () => {
  let service;
  before(async () => {
    service = await start(entry.registration, { APP_VERSION: '1.0.0' });
  });
  after(() => service.stop());

  const register = (body) =>
    fetch(`${service.url}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('returns a confirmation number', async () => {
    const response = await register({ name: 'Ada Example', email: 'ada@example.test' });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.match(body.confirmation, /^REG-[A-Z2-9]{6}$/);
    assert.equal(body.name, 'Ada Example');
    assert.equal(body.email, 'ada@example.test');
  });

  test('gives every registration its own number and counts them', async () => {
    const before = await metric(service, 'registrations_total');
    const numbers = await Promise.all(
      [1, 2, 3].map(async (n) => (await (await register({ name: `Person ${n}`, email: `p${n}@example.test` })).json()).confirmation),
    );
    assert.equal(new Set(numbers).size, 3);
    assert.equal(await metric(service, 'registrations_total'), before + 3);

    const stats = await (await fetch(`${service.url}/stats`)).json();
    assert.equal(stats.registrations_today, before + 3);
    assert.equal(stats.registrations_total, before + 3);
  });

  test('rejects a registration without a valid name and email', async () => {
    for (const body of [{ name: '', email: 'a@example.test' }, { name: 'A', email: 'not-an-email' }, {}]) {
      const response = await register(body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'invalid_request');
    }
    const notJson = await fetch(`${service.url}/register`, { method: 'POST', body: 'name=A' });
    assert.equal(notJson.status, 400);
  });

  test('keeps names and emails out of its logs', async () => {
    const { confirmation } = await (await register({ name: 'Private Person', email: 'private@example.test' })).json();
    // Log lines reach this process a moment after the response does: wait for both of this request's.
    const accepted = await until(() => service.logs.find((line) => line.confirmation === confirmation));
    await until(() => service.logs.some((line) => line.msg === 'request' && line.trace_id === accepted.trace_id));
    const text = JSON.stringify(service.logs);
    assert.ok(!text.includes('Private Person') && !text.includes('private@example.test'));
  });
});
