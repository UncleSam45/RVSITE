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
console.log('full worker reference tests passed');
