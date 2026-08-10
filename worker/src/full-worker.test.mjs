import assert from 'node:assert/strict';
import { validateOrder, buildStripeLineItems } from '../../worker.js';
const paid = { id: 'paid', title: 'Plat', available: true, pricing: { familial: 23 } };
const zeroPriced = { id: 'zero-priced', title: 'Article à prix nul', available: true, pricing: { standard: 0 } };
const site = {
  settings: { ordering: { enabled: true, minimum_order: 35, order_notice_hours: 72, currency: 'CAD' } },
  menus: { current_menu: { active: true, item_ids: ['paid'] } },
  items: { items: [paid, zeroPriced] },
  delivery: { zones: [{ city: 'Contrecoeur', enabled: true }], delivery_windows: ['17h à 19h', '19h à 21h'], rules: {} },
};
const base = { delivery_date: '2099-08-03', delivery_window_1: '17h à 19h', delivery_window_2: '19h à 21h', customer: { name: 'Test', phone: '555', street_number: '1', street_name: 'Rue', city: 'Contrecoeur' } };
const line = (item_id, portion, qty = 1) => ({ item_id, portion, qty });
const openFriday = new Date('2026-07-31T05:15:00Z');
const validate = (payload) => validateOrder(payload, site, openFriday);
const order = validate({ ...base, items: [line('paid', 'familial', 4)] });
assert.equal(order.paidSubtotalCents, 9200);
assert.equal(order.lines[0].unitAmount, 2300);
assert.throws(() => validate({ ...base, items: [line('paid', 'familial', 4), line('zero-priced', 'standard')] }), /disponible|Format invalide/);
assert.throws(() => validateOrder({ ...base, items: [line('paid', 'familial', 4)] }, site, new Date('2026-07-31T04:45:00Z')), /vendredi à 1 h/);
assert.throws(() => validateOrder({ ...base, items: [line('paid', 'familial', 4)] }, site, new Date('2026-08-05T16:00:00Z')), /vendredi à 1 h/);
const catalog = { currency: 'cad', items: { paid: { prices: { familial: { price_id: 'price_paid', amount: 23 } } } } };
assert.deepEqual(buildStripeLineItems(order.lines, catalog, site, {}), [{ price: 'price_paid', quantity: 4 }]);
assert.deepEqual(buildStripeLineItems(order.lines, { currency: 'cad', allow_dynamic_price_data: true }, site, {}), [{
  quantity: 4,
  price_data: { currency: 'cad', unit_amount: 2300, product_data: { name: 'Plat — Familial', description: 'La cuisine de Rosalie' } },
}]);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/v1/prices')) return Response.json({ data: [{ id: 'price_paid', currency: 'cad', unit_amount: 2300, nickname: 'familial', metadata: { item_id: 'paid', portion_key: 'familial' }, product: { name: 'Plat', metadata: { item_id: 'paid' } } }] });
  if (url.includes('/v1/checkout/sessions')) return Response.json({ id: 'cs_test_ok', url: 'https://checkout.stripe.test/session' });
  throw new Error(`Unexpected URL: ${url}`);
};
try {
  const worker = (await import('../../worker.js')).default;
  const response = await worker.fetch(new Request('https://example.test/api/create-checkout-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, items: [line('paid', 'familial', 4)] }),
  }), { STRIPE_SECRET_KEY: 'sk_test_example' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkout_url, 'https://checkout.stripe.test/session');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('full worker reference tests passed');
