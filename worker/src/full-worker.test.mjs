import assert from 'node:assert/strict';
import worker, { validateOrder, buildStripeLineItems } from '../../worker.js';
const paid = { id: 'paid', title: 'Plat', available: true, pricing: { familial: 23 } };
const options = [
  { id: 'delivery_flexible_day', type: 'delivery', label: 'Option flexible — disponible toute la journée', requires_address: true, enabled: true },
  { id: 'delivery_16_18', type: 'delivery', label: '16 h à 18 h', requires_address: true, enabled: true },
  { id: 'delivery_17_19', type: 'delivery', label: '17 h à 19 h', requires_address: true, enabled: true },
  { id: 'pickup_vercheres_after_19', type: 'pickup', label: 'Ramassage à Verchères après 19 h', requires_address: false, enabled: true },
];
const site = { settings: { ordering: { enabled: true, minimum_order: 35, order_notice_hours: 72, currency: 'CAD' } }, menus: { current_menu: { active: true, item_ids: ['paid'] } }, items: { items: [paid] }, delivery: { zones: [{ city: 'Contrecoeur', enabled: true }], fulfillment_options: options, delivery_policy: { version: '2026-09-04' }, rules: {} } };
const customer = { name: 'Test', phone: '555', email: 'test@example.ca', street_number: '1', street_name: 'Rue', city: 'Contrecoeur' };
const base = { delivery_date: '2099-08-03', fulfillment_option_id: 'delivery_flexible_day', delivery_policy_accepted: true, delivery_policy_version: '2026-09-04', customer, items: [{ item_id: 'paid', portion: 'familial', qty: 4 }] };
const openFriday = new Date('2026-07-31T05:15:00Z');
const validate = (overrides = {}) => validateOrder({ ...base, ...overrides }, site, openFriday);
for (const option of options) { const order = validate({ fulfillment_option_id: option.id, customer: option.type === 'pickup' ? { name: 'Test', phone: '555' } : customer, cooler_available: true }); assert.equal(order.fulfillment.id, option.id); assert.equal(order.coolerAvailable, option.type === 'delivery'); }
assert.throws(() => validate({ fulfillment_option_id: '' }), /choisir un mode/);
assert.throws(() => validate({ fulfillment_option_id: 'unknown' }), /inconnu/);
assert.throws(() => validate({ delivery_window_1: '17 h à 19 h' }), /exactement un/);
assert.throws(() => validate({ delivery_policy_accepted: false }), /accepter la politique/);
assert.throws(() => validate({ delivery_policy_version: 'old' }), /accepter la politique/);
assert.throws(() => validate({ customer: { name: 'Test', phone: '555' } }), /adresse/);
assert.throws(() => validate({ customer: { ...customer, city: 'Montréal' } }), /zone de livraison/);
assert.equal(validate({ fulfillment_option_id: 'pickup_vercheres_after_19', customer: { name: 'Test', phone: '555' } }).customer.city, '');
assert.throws(() => validate({ delivery_date: '2026-08-01' }), /délai de préparation/);
const order = validate();
const catalog = { currency: 'cad', items: { paid: { prices: { familial: { price_id: 'price_paid', amount: 23 } } } } };
assert.deepEqual(buildStripeLineItems(order.lines, catalog, site, {}), [{ price: 'price_paid', quantity: 4 }]);
let checkoutForm; const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => { checkoutForm = new URLSearchParams(init.body); return Response.json({ id: 'cs_test_ok', url: 'https://checkout.stripe.test/session' }); };
try {
  const env = { STRIPE_SECRET_KEY: 'sk_test_example', PUBLIC_SITE_DATA: site, STRIPE_CATALOG: catalog };
  const response = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('X-Checkout-Worker-Version'), 'stripe-direct-v9');
  assert.equal(checkoutForm.get('metadata[fulfillment_option_id]'), 'delivery_flexible_day'); assert.equal(checkoutForm.has('metadata[delivery_window_1]'), false);
  const missing = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), { STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_CATALOG: catalog }); assert.equal(missing.status, 503);
  assert.equal((await (await worker.fetch(new Request('https://example.test/api/health'), env)).json()).version, 'stripe-direct-v9');
} finally { globalThis.fetch = originalFetch; }
console.log('full worker fulfillment tests passed');
