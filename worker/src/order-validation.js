import { classifyCatalogItem, validatePromotion, checkoutError } from './promotion.js';

const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };

export function validateOrderItems(payloadItems, site) {
  const menu = site.menus?.current_menu || {};
  const activeIds = new Set([
    ...(Array.isArray(menu.item_ids) ? menu.item_ids : []),
    ...(Array.isArray(menu.extra_ids) ? menu.extra_ids : []),
    ...(Array.isArray(menu.promotion_ids) ? menu.promotion_ids : []),
  ].map(String));
  const allItems = Array.isArray(site.items?.items) ? site.items.items : [];
  const itemById = new Map(allItems.map((item) => [String(item.id || ''), item]));
  const lines = [];
  let paidSubtotalCents = 0;

  for (const rawLine of payloadItems.slice(0, 50)) {
    const itemId = String(rawLine?.item_id || '').trim();
    const portion = String(rawLine?.portion || '').trim();
    const qty = Math.floor(Number(rawLine?.qty));
    const item = itemById.get(itemId);
    if (!item || !activeIds.has(itemId) || item.available === false) throw checkoutError('Un item du panier n’est plus disponible.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw checkoutError(`Quantité invalide pour ${item.title || itemId}.`);

    const unitPrice = Number(item.pricing?.[portion]);
    const classification = classifyCatalogItem(item);
    if (!portion || !Number.isFinite(unitPrice) || unitPrice < 0 || (!classification.promotional && unitPrice === 0)) {
      throw checkoutError(`Format invalide pour ${item.title || itemId}.`);
    }
    const unitAmount = Math.round(unitPrice * 100);
    const line = {
      item, itemId, portion, qty, unitAmount,
      portionLabel: PORTION_LABELS[portion] || portion,
      promotional: classification.promotional,
      promotionTier: classification.tier,
    };
    lines.push(line);
    if (!line.promotional) paidSubtotalCents += unitAmount * qty;
  }

  validatePromotion(lines, paidSubtotalCents);
  return { lines, paidSubtotalCents };
}
