// registration-service: POST /register keeps a registration in memory and
// answers with a confirmation number. Nothing survives a restart.
import { randomInt } from 'node:crypto';
import { HttpError, createService, log, readJson } from '../../lib/service.js';

const MAX_STORED = 10_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const store = new Map(); // confirmation -> registration, oldest first
const today = { day: '', count: 0 };
let total = 0;

const utcDay = () => new Date().toISOString().slice(0, 10);

function newConfirmation() {
  let code;
  do {
    code = `REG-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
  } while (store.has(code));
  return code;
}

function countToday(add = 0) {
  if (today.day !== utcDay()) Object.assign(today, { day: utcDay(), count: 0 });
  today.count += add;
  return today.count;
}

const service = createService({
  name: 'registration-service',
  routes: {
    'POST /register': async ({ req, span }) => {
      const body = await readJson(req);
      const name = String(body?.name ?? '').trim();
      const email = String(body?.email ?? '').trim();
      if (!name || name.length > 100) throw new HttpError(400, 'invalid_request', 'Enter a name of up to 100 characters');
      if (!EMAIL.test(email) || email.length > 200) throw new HttpError(400, 'invalid_request', 'Enter a valid email address');

      const registration = { confirmation: newConfirmation(), name, email, registered_at: new Date().toISOString() };
      store.set(registration.confirmation, registration);
      if (store.size > MAX_STORED) store.delete(store.keys().next().value);
      total += 1;
      countToday(1);
      registrations.inc();

      span.setAttribute('registration.confirmation', registration.confirmation);
      // The name and email are personal data: they stay out of logs and spans.
      log.info('registration accepted', { confirmation: registration.confirmation });
      return { status: 201, json: registration };
    },

    'GET /stats': () => ({ json: { registrations_today: countToday(), registrations_total: total } }),
  },
});

const registrations = service.metrics.counter('registrations_total', 'Registrations accepted.');
registrations.inc({}, 0);

await service.listen();
