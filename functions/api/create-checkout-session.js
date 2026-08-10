import checkoutWorker from '../../worker.js';

// Cloudflare Pages only deploys request handlers placed under /functions.
// Keep the production route tied to the same checkout implementation and tests
// as the standalone Worker instead of relying on a separately deployed script.
export function onRequest(context) {
  return checkoutWorker.fetch(context.request, context.env, context);
}
