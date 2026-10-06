import { REFRESH_MS, clock, every, getJson, reason, refreshStatus, report } from '/static/common.js';

const form = document.querySelector('#register-form');
const button = form.querySelector('button');
const formError = document.querySelector('#form-error');
const confirmation = document.querySelector('#confirmation');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;
  button.disabled = true;
  try {
    const registration = await getJson('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value }),
    });
    document.querySelector('#confirmation-number').textContent = registration.confirmation;
    document.querySelector('#confirmation-detail').textContent = `${registration.name}, ${registration.email}, at ${clock(new Date(registration.registered_at))}.`;
    form.hidden = true;
    confirmation.hidden = false;
    report('Registration', true);
  } catch (error) {
    if (error.status >= 400 && error.status < 500) {
      // The service is fine; the form is not. Say what to change.
      formError.textContent = error.message;
      formError.hidden = false;
    } else {
      report('Registration', false, `${reason('The registration service', error)} Nothing was saved. Register again when this message clears.`);
    }
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#again').addEventListener('click', () => {
  form.reset();
  confirmation.hidden = true;
  form.hidden = false;
  form.elements.name.focus();
});

// Keeps the version line current and clears the banner once the service answers again.
every(REFRESH_MS, async () => {
  const status = await refreshStatus();
  const service = status?.services.find((entry) => entry.name === 'registration-service');
  if (service?.up) report('Registration', true);
});
