export const PROMOTION_THRESHOLDS = { petit: 8000, familial: 12000 };

export function classifyCatalogItem(item) {
  return item?.promotional === true
    ? { promotional: true, tier: String(item.promotion_tier || '') }
    : { promotional: false, tier: '' };
}

export function validatePromotion(lines, paidSubtotalCents) {
  const gifts = lines.filter((line) => line.promotional);
  if (gifts.length > 1) throw checkoutError('Un seul cadeau promotionnel est permis.', 400);
  const eligibleTier = paidSubtotalCents >= PROMOTION_THRESHOLDS.familial
    ? 'familial'
    : paidSubtotalCents >= PROMOTION_THRESHOLDS.petit ? 'petit' : '';

  if (eligibleTier && !gifts.length) throw checkoutError('Choisissez votre cadeau promotionnel avant de passer au paiement.', 400);
  if (!gifts.length) return;
  const gift = gifts[0];
  if (!eligibleTier) throw checkoutError('Le minimum de 80 $ pour le cadeau promotionnel n’est pas atteint.', 400);
  if (gift.promotionTier !== eligibleTier) throw checkoutError('Le cadeau choisi ne correspond pas au palier promotionnel atteint.', 400);
  if (gift.qty !== 1 || gift.unitAmount !== 0) throw checkoutError('Le cadeau promotionnel doit avoir une quantité de 1 et un prix de 0 $.', 400);
}

export function checkoutError(message, status = 400) {
  const error = new Error(message);
  error.publicMessage = message;
  error.status = status;
  return error;
}
