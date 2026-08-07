import assert from 'node:assert/strict';
import { validateOrderItems } from './order-validation.js';
const paid = { id: 'paid', title: 'Payé', available: true, pricing: { familial: 23 } };
const small = { id: 'gift-small', title: 'Ancien cadeau', available: true, promotional: true, promotion_tier: 'petit', pricing: { petit: 0 } };
const site = { menus: { current_menu: { item_ids: ['paid'] } }, items: { items: [paid, small] } };
const line = (item_id, portion, qty = 1) => ({ item_id, portion, qty });
assert.equal(validateOrderItems([line('paid', 'familial', 4)], site).paidSubtotalCents, 9200);
assert.throws(() => validateOrderItems([line('paid', 'familial', 4), line('gift-small', 'petit')], site), /disponible|terminée/);
console.log('discontinued promotion validation passed');
