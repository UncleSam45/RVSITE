/**
 * Retired compatibility entry point.
 *
 * Production checkout validation lives in ../worker.js and is exposed on
 * Cloudflare Pages by functions/api/create-checkout-session.js. Keeping a
 * second Node implementation caused its fulfillment rules to drift.
 */
module.exports = async function retiredCheckoutHandler(_req, res) {
  res.status(410).json({
    error: 'Cette ancienne route de paiement est retirée. Utilisez /api/create-checkout-session.',
  });
};
