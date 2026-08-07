# Checkout Worker

The production checkout Worker is the root-level `worker.js`. Deploy that complete
file to preserve Stripe checkout, delivery validation, CORS, and GitHub order-log
behavior.

The smaller `src/order-validation.js` module is a readable and independently
tested reference for catalogue validation. Only IDs in the current menu's
`item_ids` and `extra_ids` are accepted. Every selected portion must have a
strictly positive price.

Run `npm test` before deploying the Worker.
