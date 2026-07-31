import assert from 'node:assert/strict';
import { validateOrder, buildStripeLineItems } from '../../worker.js';
const paid = { id: 'paid', title: 'Plat', available: true, pricing: { familial: 23 } };
const small = { id: 'small', title: 'PROMO petit', available: true, promotional: true, promotion_tier: 'petit', pricing: { petit: 0 } };
const family = { id: 'family', title: 'PROMO famille', available: true, promotional: true, promotion_tier: 'familial', pricing: { familial: 0 } };
const site = {
  settings: { ordering: { enabled: true, minimum_order: 35, order_notice_hours: 72, currency: 'CAD' } },
  menus: { current_menu: { active: true, item_ids: ['paid'], promotion_ids: ['small', 'family'] } },
  items: { items: [paid, small, family] },
  delivery: { zones: [{ city: 'Contrecoeur', enabled: true }], delivery_windows: ['17h à 19h', '19h à 21h'], rules: {} },
};
const base = { delivery_date: '2099-08-03', delivery_window_1: '17h à 19h', delivery_window_2: '19h à 21h', customer: { name: 'Test', phone: '555', street_number: '1', street_name: 'Rue', city: 'Contrecoeur' } };
const line = (item_id, portion, qty = 1) => ({ item_id, portion, qty });
const openFriday = new Date('2026-07-31T05:15:00Z');
const validate = (payload) => validateOrder(payload, site, openFriday);
const smallOrder = validate({ ...base, items: [line('paid', 'familial', 4), line('small', 'petit')] });
assert.equal(smallOrder.paidSubtotalCents, 9200);
assert.equal(smallOrder.lines[1].unitAmount, 0);
assert.equal(smallOrder.promotionTier, 'petit');
const familyOrder = validate({ ...base, items: [line('paid', 'familial', 6), line('family', 'familial')] });
assert.equal(familyOrder.promotionTier, 'familial');
assert.throws(() => validate({ ...base, items: [line('paid', 'familial', 6), line('small', 'petit')] }), /palier/);
assert.throws(() => validate({ ...base, items: [line('paid', 'familial', 4)] }), /Choisissez/);
assert.throws(() => validateOrder({ ...base, items: [line('paid', 'familial', 4), line('small', 'petit')] }, site, new Date('2026-07-31T04:45:00Z')), /vendredi à 1 h/);
assert.throws(() => validateOrder({ ...base, items: [line('paid', 'familial', 4), line('small', 'petit')] }, site, new Date('2026-08-05T16:00:00Z')), /vendredi à 1 h/);
const catalog = { currency: 'cad', items: { paid: { prices: { familial: { price_id: 'price_paid', amount: 23 } } }, small: { prices: { petit: { price_id: 'price_free', amount: 0 } } } } };
assert.deepEqual(buildStripeLineItems(smallOrder.lines, catalog, site, {}), [{ price: 'price_paid', quantity: 4 }, { price: 'price_free', quantity: 1 }]);
assert.throws(() => buildStripeLineItems(smallOrder.lines, { items: catalog.items.paid }, site, { ALLOW_DYNAMIC_PRICE_DATA: 'true' }), /promotionnel manquant/);
console.log('full worker reference tests passed');
