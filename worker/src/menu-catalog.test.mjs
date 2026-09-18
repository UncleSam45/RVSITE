import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [itemsData, menus, settings, delivery, stripe] = await Promise.all([
  readJson('../../assets/data/items.json'),
  readJson('../../assets/data/menus.json'),
  readJson('../../assets/data/settings.json'),
  readJson('../../assets/data/delivery.json'),
  readJson('../../assets/data/stripe_catalog.json'),
]);

const expected = new Map([
  ['Penne alfredo au poulet', { petit: 8, grand: 12, familial: 23 }],
  ['Boulettes asiatiques avec riz aux légumes', { petit: 8, grand: 12, familial: 23 }],
  ['Lasagne pepperoni fromage', { petit: 8, grand: 12, familial: 23 }],
  ['Chaudron de saucisses, patates et légumes', { petit: 8, grand: 12, familial: 23 }],
  ['Porc miel et ail, riz et brocoli', { petit: 8, grand: 12, familial: 23 }],
  ['Soupe aux légumes', { standard: 4 }],
  ['Salade du chef', { standard: 5 }],
  ['Salade grecque', { standard: 5 }],
  ['Collation céleri et carottes, trempette maison', { standard: 5 }],
  ['Collation yogourt grec et bleuets', { standard: 5 }],
  ['Sous-marins viande froide', { standard: 7 }],
  ['Sous-marins pizza', { standard: 7 }],
]);
const activeIds = [...menus.current_menu.item_ids, ...menus.current_menu.extra_ids];
const activeItems = itemsData.items.filter((item) => activeIds.includes(item.id));
assert.equal(activeIds.length, expected.size, 'the active menu must not contain stale entries');
assert.equal(new Set(activeIds).size, activeIds.length, 'active menu IDs must be unique');
assert.equal(activeItems.length, expected.size, 'every active menu ID must resolve');
assert.equal(itemsData.items.length, expected.size, 'items.json must contain only the current menu');
for (const item of activeItems) {
  assert.deepEqual(item.pricing, expected.get(item.title), `unexpected item or pricing: ${item.title}`);
  const catalogItem = stripe.items[item.id];
  assert.ok(catalogItem, `Stripe catalogue entry missing: ${item.id}`);
  assert.equal(catalogItem.title, item.title);
  for (const [portion, amount] of Object.entries(item.pricing)) {
    assert.equal(catalogItem.prices[portion].amount, amount);
    assert.equal(catalogItem.prices[portion].currency, 'cad');
  }
}
assert.equal(settings.ordering.minimum_order, 35);
assert.equal(delivery.rules.minimum_order, 35);
assert.equal(settings.ordering.order_notice_hours, 72);
assert.equal(delivery.rules.order_notice_hours, 72);
console.log('current menu and Stripe catalogue data passed');
