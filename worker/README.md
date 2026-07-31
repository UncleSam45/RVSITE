# Checkout Worker promotion patch

The production Worker source is deployed separately from this repository. Its
current validation only admits `current_menu.item_ids` and `extra_ids`, and it
rejects every price `<= 0`. Consequently, a correctly synchronized promotional
Stripe Price still fails before the Stripe catalogue lookup.

For deployment, copy the complete root-level `worker.js` into the Cloudflare
Worker editor. It contains the original checkout, Stripe, delivery, CORS, and
GitHub order-log behavior together with the corrected promotion validation.

The smaller `src/order-validation.js` module remains as a readable reference
for the essential validation changes:

1. Replace its `activeIds`/item loop with `validateOrderItems(payload.items, site)`.
2. Use the returned `lines` as `validatedOrder.lines`.
3. Use `paidSubtotalCents` for the minimum-order check and as
   `validatedOrder.subtotalCents`.
4. Keep the existing `buildStripeLineItems` unchanged. It already accepts a
   real Stripe Price ID whose catalogue amount is zero.

The helper enforces all server-side invariants: promotion IDs are legitimate
menu IDs, zero is allowed only on promotional products, gift quantity is one,
only one gift is accepted, paid items alone determine eligibility, and only the
highest eligible tier is accepted.

Run `node src/promotion.test.mjs` before deploying the Worker.
