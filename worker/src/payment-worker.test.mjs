import assert from 'node:assert/strict';
import worker, {
  normalizeTemplate,
  renderConfirmationEmail,
  validateOrderAgainstSession,
  verifyStripeSignature,
} from '../../worker2.js';

const health = await worker.fetch(new Request('https://worker.test/health'), {});
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true, service: 'rvsite-payment-events', version: '1.0.0' });

const payload = JSON.stringify({ id: 'evt_test' });
const timestamp = 1_786_406_400;
const secret = 'whsec_test';
const key = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
assert.equal(await verifyStripeSignature(`${payload} `, `t=${timestamp},v1=${signature}`, secret, timestamp), false);
assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp + 301), false);

const order = {
  order_id: 'rosalie_123',
  stripe_checkout_session_id: 'cs_test_123',
  total_cents: 6600,
  currency: 'CAD',
  customer: { name: 'Marie Tremblay', email: 'marie@example.test', street_number: '10', street_name: 'Principale', city: 'Contrecoeur' },
  delivery_date: '2026-08-13',
  delivery_window_1: '13 h à 15 h',
  delivery_window_2: '15 h à 17 h',
  items: [{ quantity: 3, title: '<Penne rosée>', portion: 'Familial' }],
};
const session = { id: 'cs_test_123', amount_total: 6600, currency: 'cad' };
assert.doesNotThrow(() => validateOrderAgainstSession(order, order.order_id, session));
assert.throws(() => validateOrderAgainstSession(order, order.order_id, { ...session, amount_total: 6500 }), /amount conflicts/);

const template = normalizeTemplate({ headline: 'Allô {{customer_first_name}}', subject: 123, enabled: true });
assert.equal(template.subject, 'Confirmation de votre commande');
const html = renderConfirmationEmail(order, session, template);
assert.match(html, /Allô Marie/);
assert.match(html, /66,00/);
assert.match(html, /&lt;Penne rosée&gt;/);
assert.doesNotMatch(html, /<Penne rosée>/);

console.log('payment worker tests passed');
