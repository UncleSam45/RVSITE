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

## Components

| Path | Role |
| --- | --- |
| `index.html` | Static document shell and public metadata. |
| `main.js` | Storefront renderer, menu navigation, cart, delivery form, and checkout client. |
| `assets/data/` | Public JSON source for settings, menus, items, promotions, delivery rules, gallery, content, and the Stripe catalogue. |
| `assets/images/` | Product and storefront media. |
| `worker/src/` | Modular Cloudflare Worker checkout implementation and tests. |
| `worker.js` | Standalone Worker-compatible checkout entry point. |
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

## Local storefront preview

The static site can be served with Python:

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/`.

For the NiceGUI preview, install the required Python dependency and run:

```bash
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
