import assert from 'node:assert/strict';
import { validateOrderItems } from './order-validation.js';
const paid = { id: 'paid', title: 'Payé', available: true, pricing: { familial: 23 } };
const zeroPriced = { id: 'zero-priced', title: 'Article à prix nul', available: true, pricing: { standard: 0 } };
const site = { menus: { current_menu: { item_ids: ['paid'] } }, items: { items: [paid, zeroPriced] } };
const line = (item_id, portion, qty = 1) => ({ item_id, portion, qty });
assert.equal(validateOrderItems([line('paid', 'familial', 4)], site).paidSubtotalCents, 9200);
assert.throws(() => validateOrderItems([line('paid', 'familial', 4), line('zero-priced', 'standard')], site), /disponible|Format invalide/);
console.log('order validation passed');
