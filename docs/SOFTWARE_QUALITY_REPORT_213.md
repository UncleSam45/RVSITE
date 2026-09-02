# Software quality-control report — Ticket #213

**Release reviewed:** ORION ALPHA v212.0.0<br>
**Review date:** 2026-09-02<br>
**Reviewer:** ORION / CROWDNET SOFTWARES<br>
**Disposition:** **NO-GO for production checkout**

## Executive summary

The repository's existing automated tests, Python syntax checks, JavaScript syntax
checks, and JSON parsing checks pass. The current checkout configuration is not,
however, releasable. The committed live Stripe catalogue is empty, the production
checkout handler does not apply the repository's full business validation, and the
public storefront contains an administrative workflow that handles privileged
GitHub and Stripe credentials in browser JavaScript.

This review found **one blocker, two critical issues, two high issues, and two
medium issues**. No live payment or credential-bearing test was attempted.

## Scope and method

The review covered the static storefront, the Cloudflare checkout and payment
workers, the Pages adapter, Python administration utilities, committed public JSON,
deployment workflow, and current automated tests. Checks performed:

- ran all Node worker tests and Python unit tests;
- compiled all Python entry points and syntax-checked all JavaScript entry points;
- parsed every tracked JSON document;
- compared current-menu IDs with item IDs and Stripe catalogue entries;
- inspected checkout trust boundaries, credential handling, fallback behavior, and
  deployment configuration;
- ran the package's documented Wrangler dry-run check.

## Findings

### SQ-213-01 — Blocker — The deployed catalogue cannot create a checkout

The committed `stripe_catalog.json` declares the **live** environment but contains
an empty `items` object. The Pages adapter always injects that object as
`STRIPE_CATALOG`; consequently, `loadCheckoutCatalog()` returns it immediately and
never uses its Stripe API discovery fallback. Every submitted item then fails the
price lookup with HTTP 409.

The current menu has 15 unique item references. All 15 exist in `items.json`, but
none has an entry in the committed Stripe catalogue.

**Impact:** Checkout is unavailable wherever the Pages adapter uses the committed
catalogue without an environment override.

**Recommendation:** Treat an empty or stale catalogue as a deployment failure.
Populate and verify all current-menu price mappings before release, inject a valid
`STRIPE_CATALOG` binding, and add an adapter integration test that uses the actual
committed JSON.

### SQ-213-02 — Critical — Production checkout bypasses business rules

`createCheckoutSession()` calls the reduced `validateCatalogOrder()` path rather
than the exported `validateOrder()` path. The reduced validator checks basic
contact fields and presence of two distinct delivery-window strings, but does not
enforce:

- ordering enabled/disabled state or the weekly ordering window;
- membership in the current menu or item availability;
- the configured minimum order;
- allowed delivery cities;
- allowed delivery windows;
- preparation notice or weekday delivery restrictions.

The Pages adapter supplies `PUBLIC_SITE_DATA`, but the checkout-session path never
uses that value. Browser validation is not a security boundary and requests can be
submitted directly to the endpoint.

**Impact:** With a populated Stripe catalogue, a crafted request can create a
payment session for stale items, below-minimum orders, unsupported cities, or
invalid dates/windows.

**Recommendation:** Make server-side `validateOrder(payload, PUBLIC_SITE_DATA)`
mandatory before mapping trusted Stripe prices. Add endpoint tests for every
business rule and direct-request bypass attempt.

### SQ-213-03 — Critical — Privileged Stripe operations run in public browser code

The public `main.js` asks for a Stripe secret key and sends it directly from the
browser to Stripe's API. The same public application accepts a GitHub token and
uses it to write repository content. Any script executing in that origin (including
a future compromised dependency or injected script) shares access to these
in-memory credentials; browser tooling and extensions also expand exposure.

**Impact:** Theft of a Stripe secret or write-capable GitHub token can expose
customer/payment metadata, alter products and prices, or modify the deployed site.

**Recommendation:** Remove privileged administration and Stripe synchronization
from the public artifact. Put these operations behind a separately deployed,
authenticated server-side control plane with least-privilege secrets, authorization,
audit logs, CSRF protection, and short sessions. Rotate any credential ever entered
into the public tool if its environment cannot be trusted.

### SQ-213-04 — High — “Remember access key” persists a GitHub token in localStorage

When selected, the administrative login stores its access token in
`localStorage`. That storage has no expiry and is readable by any JavaScript that
executes on the same origin. “Logout” does not remove a remembered key.

**Impact:** A later cross-site scripting flaw, shared browser profile, malicious
extension, or local access can recover a long-lived repository credential.

**Recommendation:** Do not store privileged tokens in browser storage. Use a
server-managed, HttpOnly, Secure, SameSite session cookie with expiry and explicit
revocation; ensure logout invalidates the server session.

### SQ-213-05 — High — Checkout failure logging exposes customer PII

The checkout error path logs the complete request payload to the browser console.
That object includes customer name, phone, email, street address, postal code,
delivery notes, order contents, and preferences.

**Impact:** Personal information is unnecessarily retained in browser logs and can
be exposed through screenshots, support exports, shared machines, extensions, or
remote debugging.

**Recommendation:** Log only a generated correlation ID and a sanitized error
category. Never log the checkout payload. Define and test a redaction policy for
both browser and worker logs.

### SQ-213-06 — Medium — The documented Worker dry-run is not reproducible

`npm run check` executes `wrangler deploy --dry-run`, but no Wrangler configuration
identifies the worker entry point. Wrangler exits with “Could not detect a directory
containing static files.” The package also documents `npm run dev` and deployment
commands that depend on the same missing configuration.

**Impact:** Contributors and CI cannot validate the deploy bundle using the
repository's own command, increasing configuration drift and release risk.

**Recommendation:** Commit an explicit `wrangler.jsonc`/`wrangler.toml` with the
correct entry point and compatibility date, or pass the entry point in each script.
Run the dry-run in CI.

### SQ-213-07 — Medium — Tests do not exercise the production adapter and data

The Node tests pass, but the checkout test builds synthetic catalogue fixtures and
does not import the Pages adapter with the committed menu/catalogue data. Thus the
empty live catalogue and unused `PUBLIC_SITE_DATA` pass the suite.

**Impact:** Green tests provide misleading confidence about deployability and
business-rule enforcement.

**Recommendation:** Add contract tests that import the deployed adapter, load the
committed JSON, assert complete menu-to-catalogue mappings, and verify rejection of
invalid business cases at the HTTP boundary.

## Checks that passed

- `cd worker && npm test` — all order-validation, full-worker reference, and payment
  worker tests passed.
- `python3 -m unittest -v` — 2 tests passed.
- `python3 -m py_compile main.py editor.py striper.py test_main.py` — passed.
- `node --check` for the root, adapter, serverless, and `worker/src` JavaScript files
  — passed.
- JSON parsing for all tracked JSON files — passed.
- Current-menu referential integrity — 15 references, 15 unique, no missing item
  IDs, and no duplicate item IDs.

## Check that failed

- `cd worker && npm run check` — failed because Wrangler has no usable project/entry
  configuration.

## Release recommendation

Keep the pre-alpha warning and **do not enable production payments**. SQ-213-01 and
SQ-213-02 must be resolved and covered by HTTP-level integration tests before a
checkout deployment. SQ-213-03 through SQ-213-05 should be resolved before any
administrator enters real credentials or customer data is processed. Complete the
Wrangler/CI improvements before calling the release reproducibly deployable.

After remediation, repeat this review in Stripe test mode with success,
cancellation, tampered payload, stale catalogue, unsupported location, invalid
delivery date/window, below-minimum order, webhook retry, and log-redaction cases.
