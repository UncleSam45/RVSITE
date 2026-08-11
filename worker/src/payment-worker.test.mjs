import assert from 'node:assert/strict';
import worker, {
  normalizeTemplate,
  normalizeDelivery,
  renderConfirmationEmail,
  validateOrderAgainstSession,
  verifyStripeSignature,
  githubContentsBaseUrl,
  githubReadUrl,
  loadTemplate,
  missingEmailConfiguration,
  requireCoreConfiguration,
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

const coreEnvironment = {
  STRIPE_SECRET_KEY: 'sk_test',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  GITHUB_TOKEN: 'github_test',
  GITHUB_OWNER: 'UncleSam45',
  GITHUB_ORDER_REPO: 'RVSITE_BRIDGE',
};
assert.doesNotThrow(() => requireCoreConfiguration(coreEnvironment));
assert.deepEqual(missingEmailConfiguration(coreEnvironment), ['RESEND_API_KEY', 'EMAIL_FROM']);
assert.throws(() => requireCoreConfiguration({}), /STRIPE_SECRET_KEY.*GITHUB_ORDER_REPO/);

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
const subtotalOrder = { ...order, total_cents: undefined, subtotal_cents: 6600 };
assert.doesNotThrow(() => validateOrderAgainstSession(subtotalOrder, order.order_id, session));
assert.throws(() => validateOrderAgainstSession(subtotalOrder, order.order_id, { ...session, amount_total: 6500 }), /amount conflicts/);

const nestedDeliveryOrder = {
  ...order,
  delivery_date: undefined,
  delivery_window_1: undefined,
  delivery_window_2: undefined,
  delivery: { date: '2026-08-14', window_1: '13h à 15h', window_2: '17h à 19h' },
  customer: { ...order.customer, province: 'Québec', postal_code: 'J0L 1C0' },
};
assert.deepEqual(normalizeDelivery(nestedDeliveryOrder), {
  date: '2026-08-14',
  window1: '13h à 15h',
  window2: '17h à 19h',
  address: '10 Principale Contrecoeur Québec J0L 1C0',
});

const githubRepo = { owner: 'Uncle Sam', repo: 'RVSITE_BRIDGE', branch: 'feature/orders' };
const githubBase = 'https://api.github.com/repos/Uncle%20Sam/RVSITE_BRIDGE/contents/data/orders.json';
assert.equal(githubContentsBaseUrl(githubRepo, 'data/orders.json'), githubBase);
assert.equal(githubReadUrl(githubRepo, 'data/orders.json'), `${githubBase}?ref=feature%2Forders`);

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
console.warn = () => {};
try {
  globalThis.fetch = async () => Response.json({ message: 'Not Found' }, { status: 404 });
  assert.equal((await loadTemplate({ ...coreEnvironment, RVSITE_REPO: 'RVSITE' })).subject, 'Confirmation de votre commande');
  globalThis.fetch = async () => Response.json({ content: btoa('malformed json'), sha: 'abc123' });
  assert.equal((await loadTemplate({ ...coreEnvironment, RVSITE_REPO: 'RVSITE' })).headline, 'Merci pour votre commande!');
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

const template = normalizeTemplate({ headline: 'Allô {{customer_first_name}}', subject: 123, enabled: true });
assert.equal(template.subject, 'Confirmation de votre commande');
const html = renderConfirmationEmail(order, session, template);
assert.match(html, /Allô Marie/);
assert.match(html, /66,00/);
assert.match(html, /&lt;Penne rosée&gt;/);
assert.doesNotMatch(html, /<Penne rosée>/);
const nestedHtml = renderConfirmationEmail(nestedDeliveryOrder, session, {
  ...template,
  delivery_message: '{{delivery_date}} — {{delivery_window_1}} / {{delivery_window_2}} — {{delivery_address}}',
});
assert.match(nestedHtml, /2026-08-14/);
assert.match(nestedHtml, /13h à 15h/);
assert.match(nestedHtml, /10 Principale Contrecoeur Québec J0L 1C0/);

console.log('payment worker tests passed');
