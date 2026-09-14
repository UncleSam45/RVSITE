import assert from 'node:assert/strict';
import worker, { validateOrder, buildStripeLineItems } from '../../worker.js';

const paid = { id: 'paid', title: 'Plat', available: true, pricing: { familial: 23 } };
const options = [
  { id: 'delivery_flexible_day', type: 'delivery', label: 'Option flexible — disponible toute la journée', requires_address: true, enabled: true },
  { id: 'delivery_16_18', type: 'delivery', label: '16 h à 18 h', requires_address: true, enabled: true },
  { id: 'delivery_17_19', type: 'delivery', label: '17 h à 19 h', requires_address: true, enabled: true },
  { id: 'pickup_vercheres_after_19', type: 'pickup', label: 'Ramassage à Verchères après 19 h', requires_address: false, enabled: true },
];
const site = { settings: { ordering: { enabled: true, minimum_order: 35, order_notice_hours: 72, currency: 'CAD' } }, menus: { current_menu: { id: 'menu-test', active: true, item_ids: ['paid'] } }, items: { items: [paid] }, delivery: { zones: [{ city: 'Contrecoeur', enabled: true }], fulfillment_options: options, delivery_policy: { version: '2026-09-04' }, rules: {} } };
const customer = { name: 'Test', phone: '555', email: 'test@example.ca', street_number: '1', street_name: 'Rue', city: 'Contrecoeur' };
const base = { delivery_date: '2099-08-03', fulfillment_option_id: 'delivery_flexible_day', delivery_policy_accepted: true, delivery_policy_version: '2026-09-04', customer, items: [{ item_id: 'paid', portion: 'familial', qty: 4 }] };
const openFriday = new Date('2026-07-31T05:15:00Z');
const validate = (overrides = {}) => validateOrder({ ...base, ...overrides }, site, openFriday);

for (const option of options) {
  const order = validate({ fulfillment_option_id: option.id, customer: option.type === 'pickup' ? { name: 'Test', phone: '555' } : customer, cooler_available: true });
  assert.equal(order.fulfillment.id, option.id);
  assert.equal(order.coolerAvailable, option.type === 'delivery');
}
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
const catalog = { currency: 'cad', items: { paid: { title: 'Plat', prices: { familial: { price_id: 'price_paid', amount: 23 } } } } };
assert.deepEqual(buildStripeLineItems(order.lines, catalog, site, {}), [{ price: 'price_paid', quantity: 4 }]);

// Regression for #151: an item ID must never silently resolve to a Stripe
// Product carrying a different semantic identity, even when amount/portion match.
const driftedCatalog = { currency: 'cad', items: { paid: { title: 'Ancien plat', prices: { familial: { price_id: 'price_wrong', amount: 23, product_name: 'Ancien plat' } } } } };
assert.throws(() => buildStripeLineItems(order.lines, driftedCatalog, site, {}), /autre produit/);

// Dynamic price_data is an explicit recovery path. It must be built from the
// already validated site line and preserve structured identity metadata.
const dynamic = buildStripeLineItems(order.lines, driftedCatalog, site, { ALLOW_DYNAMIC_PRICE_DATA: 'true' });
assert.equal(dynamic[0].price, undefined);
assert.equal(dynamic[0].price_data.unit_amount, 2300);
assert.equal(dynamic[0].price_data.product_data.name, 'Plat — Familial');
assert.deepEqual(dynamic[0].price_data.product_data.metadata, { source: 'rvsite_checkout', item_id: 'paid', portion_key: 'familial', menu_id: 'menu-test' });

// Portion-only/global fallback mappings caused cross-product substitution and
// are no longer eligible catalogue evidence.
const globalOnly = { currency: 'cad', prices: { familial: 'price_wrong' }, allow_dynamic_price_data: true };
const globalFallback = buildStripeLineItems(order.lines, globalOnly, site, {});
assert.equal(globalFallback[0].price, undefined);
assert.equal(globalFallback[0].price_data.product_data.name, 'Plat — Familial');

// Same title with the wrong amount is also a catalogue conflict.
const wrongAmount = { currency: 'cad', items: { paid: { title: 'Plat', prices: { familial: { price_id: 'price_wrong_amount', amount: 99 } } } } };
assert.throws(() => buildStripeLineItems(order.lines, wrongAmount, site, {}), /autre produit/);

let checkoutForm;
let catalogPages = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const published = { settings: site.settings, menus: site.menus, items: site.items, delivery: site.delivery };
  const match = url.match(/\/assets\/data\/(settings|menus|items|delivery)\.json$/);
  if (match) return Response.json(published[match[1]]);
  if (url.startsWith('https://api.stripe.com/v1/prices?')) {
    catalogPages += 1;
    const parsed = new URL(url);
    if (!parsed.searchParams.get('starting_after')) {
      return Response.json({ data: [{ id: 'price_other', currency: 'cad', unit_amount: 2300, metadata: { item_id: 'other', portion_key: 'familial' }, product: { id: 'prod_other', active: true, name: 'Autre', metadata: {} } }], has_more: true });
    }
    return Response.json({ data: [{ id: 'price_paid_paged', currency: 'cad', unit_amount: 2300, metadata: { item_id: 'paid', portion_key: 'familial' }, product: { id: 'prod_paid', active: true, name: 'Plat', metadata: {} } }], has_more: false });
  }
  checkoutForm = new URLSearchParams(init.body);
  return Response.json({ id: 'cs_test_ok', url: 'https://checkout.stripe.test/session' });
};

try {
  const env = { STRIPE_SECRET_KEY: 'sk_test_example', PUBLIC_SITE_DATA: site, STRIPE_CATALOG: catalog };
  const response = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Checkout-Worker-Version'), 'stripe-direct-v11');
  assert.equal(checkoutForm.get('line_items[0][price]'), 'price_paid');
  assert.equal(checkoutForm.get('metadata[menu_id]'), 'menu-test');
  assert.equal(checkoutForm.get('metadata[checkout_worker_version]'), 'stripe-direct-v11');
  assert.equal(checkoutForm.get('metadata[fulfillment_option_id]'), 'delivery_flexible_day');
  assert.equal(checkoutForm.has('metadata[delivery_window_1]'), false);

  const dynamicResponse = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), { STRIPE_SECRET_KEY: 'sk_test_example', PUBLIC_SITE_DATA: site, STRIPE_CATALOG: driftedCatalog, ALLOW_DYNAMIC_PRICE_DATA: 'true' });
  assert.equal(dynamicResponse.status, 200);
  assert.equal(checkoutForm.has('line_items[0][price]'), false);
  assert.equal(checkoutForm.get('line_items[0][price_data][product_data][name]'), 'Plat — Familial');
  assert.equal(checkoutForm.get('line_items[0][price_data][product_data][metadata][item_id]'), 'paid');
  assert.equal(checkoutForm.get('line_items[0][price_data][product_data][metadata][portion_key]'), 'familial');

  // The independently deployed Worker can scan every active Stripe Price page
  // and must not stop at the first 100 entries.
  catalogPages = 0;
  const pagedResponse = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), { STRIPE_SECRET_KEY: 'sk_test_example', PUBLIC_SITE_DATA: site });
  assert.equal(pagedResponse.status, 200);
  assert.equal(catalogPages, 2);
  assert.equal(checkoutForm.get('line_items[0][price]'), 'price_paid_paged');

  // The standalone production Worker has no Pages import binding. It must load
  // the authoritative published JSON instead of returning the regression 503.
  const standalone = await worker.fetch(new Request('https://example.test/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }), { STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_CATALOG: catalog });
  assert.equal(standalone.status, 200);
  assert.equal((await (await worker.fetch(new Request('https://example.test/api/health'), env)).json()).version, 'stripe-direct-v11');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('full worker fulfillment and catalogue-integrity tests passed');