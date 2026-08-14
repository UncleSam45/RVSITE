# La cuisine de Rosalie

> [!CAUTION]
> **PRE-ALPHA PROTOTYPE — NOT PRODUCTION-READY**
>
> This repository contains experimental infrastructure designed solely for prototyping and proof-of-concept work. It has not been hardened, fully tested, or validated for production use. Do not use it to process real customer data, payments, or live business operations without first completing an independent security, privacy, compliance, reliability, and operational review.

La cuisine de Rosalie is a skeleton-frame engine for a small online catering service. It provides the minimum architecture needed to publish a weekly menu, manage structured catalogue content, validate an order, and hand payment to Stripe without coupling the public storefront to a traditional application server.

> **Project status:** pre-alpha and active prototyping. The interfaces, data schemas, checkout flow, deployment model, and administration tools may change without notice.

## Architecture

The project separates customer-facing delivery, editable business data, checkout validation, and local administration:

1. The browser loads the static shell from `index.html`.
2. `main.js` reads JSON documents from `assets/data/` and renders the storefront, menu, promotions, delivery choices, and cart.
3. The checkout endpoint reloads trusted catalogue data, validates the submitted item identifiers, portions, quantities, delivery details, ordering window, and minimum order, then creates a Stripe Checkout session.
4. Stripe hosts payment collection and redirects the customer back to the configured public site.
5. Local Python tools maintain catalogue data, preview the storefront, and synchronize Stripe catalogue records.

This skeleton keeps prices and availability in repository-managed data rather than trusting values submitted by the browser. It is intentionally small enough to adapt for another caterer while preserving clear boundaries between presentation, content, order validation, and payments.

## Quick start

The storefront has no build step. From the repository root, start a local static
server:

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`. The menu and site content are loaded directly
from `assets/data/`, so edits to those JSON files are visible after a browser
refresh. A static preview does not provide a working Stripe checkout endpoint; use
Stripe test mode and configure one of the server-side checkout options before
testing payments.

To run the checkout test suite:

```bash
cd worker
npm install
npm test
```

Python 3 is sufficient for the static preview. The optional administration and
preview applications also require NiceGUI, while the checkout tests require a
current Node.js/npm installation.

## Components

| Path | Role |
| --- | --- |
| `index.html` | Static document shell and public metadata. |
| `main.js` | Storefront renderer, menu navigation, cart, delivery form, and checkout client. |
| `assets/data/` | Public JSON source for settings, menus, items, promotions, delivery rules, gallery, content, and the Stripe catalogue. |
| `assets/images/` | Product and storefront media. |
| `worker/src/` | Modular Cloudflare Worker checkout implementation and tests. |
| `worker.js` | Standalone Worker-compatible checkout entry point. |
| `worker2.js` | Standalone Stripe webhook, payment confirmation, GitHub order update, and Resend email Worker. |
| `functions/api/create-checkout-session.js` | Cloudflare Pages Function adapter for the checkout Worker. |
| `serverless/create-checkout-session.js` | Alternative Node serverless checkout endpoint skeleton. |
| `editor.py` | NiceGUI catalogue and content editor for local administration. |
| `main.py` | NiceGUI development preview and browser-console bridge. |
| `striper.py` | Local Stripe catalogue planning, synchronization, and reporting tool. |
| `docs/` | Deployment, administration, and launch-review documents. |

## Data model

The storefront is driven by committed JSON files:

- `settings.json` contains business identity, contact details, ordering settings, and external links.
- `menus.json` selects the active menu and its available products.
- `items.json` defines dishes, descriptions, portions, prices, images, and availability.
- `promotions.json` defines promotional rules and eligible gifts.
- `delivery.json` defines supported zones, delivery windows, and order constraints.
- `content.json` and `gallery.json` contain editable presentation content.
- `stripe_catalog.json` maps catalogue choices to synchronized Stripe records.

Treat the deployed JSON as public information. Secrets such as Stripe keys, GitHub tokens, and credentials must be supplied through environment variables or deployment-platform secret storage and must never be committed.

## NiceGUI storefront preview

For the optional NiceGUI preview, install NiceGUI and run:

```bash
python3 -m pip install nicegui
python3 main.py
```

The NiceGUI preview serves the committed public data and forwards browser console output to the development terminal.

## Content administration

Start the local editor with:

```bash
python3 editor.py
```

Review the generated changes under `assets/data/` and `assets/images/` before committing them. The public site only receives content that has been committed and deployed. Operational instructions are available in `docs/ADMIN_GUIDE.md`.

## Checkout worker

The Worker package requires Node.js and npm:

```bash
cd worker
npm install
npm test
npm run dev
```

Configure the bindings and secrets expected by the selected checkout implementation before local or remote use. The browser should submit catalogue identifiers and customer fulfilment details only; the checkout service remains responsible for loading authoritative prices and enforcing order rules.

The root `worker.js`, modular `worker/src/` implementation, and Node serverless example are alternative integration surfaces. Choose and deploy one checkout path rather than assuming that every example is active.

### Checkout configuration

The root Worker accepts `GET /health` (or `/api/health`) for health checks and
`POST /create-checkout-session` (or `/api/create-checkout-session`) for checkout.
Configure its runtime through deployment-platform secrets and variables:

| Name | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key used to retrieve prices and create Checkout Sessions. Use a test-mode key while developing. |
| `STRIPE_CATALOG` or `STRIPE_CATALOG_JSON` | Recommended | Authoritative Stripe catalogue binding or JSON value. Without one, the Worker retrieves the active Stripe prices. |
| `ALLOWED_ORIGIN` | Recommended | Exact storefront origin allowed by CORS. The default `*` is intended only for early prototyping. |
| `PUBLIC_SITE_ORIGIN` | Recommended | Canonical storefront origin used when constructing redirects and validating requests. |
| `CHECKOUT_SUCCESS_URL` | Optional | Overrides the default successful-payment return URL. |
| `CHECKOUT_CANCEL_URL` | Optional | Overrides the default cancelled-payment return URL. |
| `BUSINESS_NAME` | Optional | Business name stored in Stripe session metadata. |
| `ALLOW_DYNAMIC_PRICE_DATA` | Optional | Set to `true` only when intentionally allowing validated catalogue price data instead of Stripe price IDs. |

Keep `STRIPE_SECRET_KEY` in secret storage; do not add it to the JSON catalogue or
client-side code. Before connecting the storefront, verify the deployment with:

```bash
curl https://YOUR-WORKER.example/health
```

For implementation-specific deployment details, see `worker/README.md` and
`docs/DEPLOYMENT.md`.

### Payment confirmation worker

Copy `worker2.js` into a separate Cloudflare module Worker. It exposes `GET /health`
and `POST /stripe/webhook`; the webhook route verifies the raw Stripe signature,
reloads the authoritative Checkout Session, safely updates the GitHub order record,
and delivers the repository-controlled confirmation email through Resend.

Configure these Cloudflare secrets (never commit their values):

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GITHUB_TOKEN`.

Stripe and GitHub configuration is validated independently from email delivery.
Consequently, a missing `RESEND_API_KEY` or `EMAIL_FROM` does not prevent a valid
payment from being marked paid; the order instead records an email configuration
failure for follow-up. If the template file is missing or malformed, the Worker uses
its built-in safe French confirmation template.

Configure `GITHUB_OWNER`, `GITHUB_ORDER_REPO`, and `EMAIL_FROM`, plus the optional
`GITHUB_ORDER_BRANCH`, `GITHUB_ORDER_PATH`, `RVSITE_REPO`, `RVSITE_BRANCH`,
`EMAIL_TEMPLATE_PATH`, and `BUSINESS_NAME` variables. The GitHub token needs only
Contents read/write access to the order repository and Contents read access to this
repository. Register `/stripe/webhook` for `checkout.session.completed` and
`checkout.session.async_payment_succeeded` in Stripe. Rosalie's editable copy and
section switches live in `assets/data/email_templates.json`; no HTML or credentials
are exposed there.

## Stripe catalogue synchronization

Run the local synchronization interface with:

```bash
python3 striper.py
```

Use a restricted test-mode Stripe key during beta testing. Inspect the proposed operations and generated report before applying catalogue changes. Production credentials and live transactions are outside the safe default scope of this prototype.

## Deployment

The static storefront can be hosted by GitHub Pages or another static hosting provider. Publish the HTML shell, JavaScript application, domain configuration, headers, and assets together. The checkout service must be deployed separately to a platform capable of protecting secrets and making outbound Stripe API requests.

The custom domain is declared in `CNAME`. See `docs/DEPLOYMENT.md` for repository and Pages setup details.

## Beta validation priorities

Before a production launch, validate at least:

- Stripe test-mode success, cancellation, duplicate submission, and failure paths;
- server-side price, promotion, availability, ordering-window, and delivery validation;
- mobile layout, keyboard navigation, screen-reader labels, and colour contrast;
- customer consent, privacy handling, retention, refund, cancellation, and contact policies;
- taxes, delivery fees, minimum orders, capacity limits, and fulfilment notifications;
- monitoring, structured error reporting, backups, rollback, and secret rotation;
- compatibility between edited JSON, the public renderer, Stripe mappings, and the deployed checkout endpoint.

Use `docs/CLIENT_CONFIRMATION_CHECKLIST.md` as a launch-review starting point. Passing the existing automated tests does not make the prototype production-ready.

## Testing

Run the checkout tests:

```bash
cd worker
npm test
```

Check Python syntax without starting the graphical tools:

```bash
python3 -m py_compile main.py editor.py striper.py
```

## Project scope

This repository is an adaptable catering-commerce frame, not a complete hosted service. Inventory management, authenticated administration, customer accounts, webhook fulfilment, transactional messaging, observability, and jurisdiction-specific compliance can be added behind the existing boundaries as the prototype matures.
