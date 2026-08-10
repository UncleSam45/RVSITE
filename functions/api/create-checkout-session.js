import checkoutWorker from '../../worker.js';
import settings from '../../assets/data/settings.json' with { type: 'json' };
import menus from '../../assets/data/menus.json' with { type: 'json' };
import items from '../../assets/data/items.json' with { type: 'json' };
import delivery from '../../assets/data/delivery.json' with { type: 'json' };
import stripeCatalog from '../../assets/data/stripe_catalog.json' with { type: 'json' };

const PUBLIC_SITE_DATA = Object.freeze({ settings, menus, items, delivery });

// Cloudflare Pages only deploys request handlers placed under /functions.
// Keep the production route tied to the same checkout implementation and tests
// as the standalone Worker instead of relying on a separately deployed script.
export function onRequest(context) {
  const env = {
    ...context.env,
    PUBLIC_SITE_DATA: context.env.PUBLIC_SITE_DATA || PUBLIC_SITE_DATA,
    STRIPE_CATALOG: context.env.STRIPE_CATALOG || stripeCatalog,
  };
  return checkoutWorker.fetch(context.request, env, context);
}
