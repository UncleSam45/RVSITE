# La cuisine de Rosalie

Static storefront and local editor/preview tools for **La cuisine de Rosalie**.

## Current public state

The public website is temporarily held behind a French opening screen until **July 8, 2026**.

The opening gate is implemented in two places:

- `index.html` contains the first-render static landing screen so visitors to the deployed site immediately see the opening message.
- `main.js` contains a client-side date gate (`SITE_OPENING_DATE`) that prevents the full app from initializing before the opening date.

The live custom domain is configured in `CNAME` as:

```text
lacuisinederosalie.ca
```

## Project structure

- `index.html` — public static HTML shell for the deployed site.
- `main.js` — frontend storefront application and pre-launch gate logic.
- `assets/data/*.json` — public menu, business, delivery, promotion, content, and gallery data.
- `assets/images/**` — public image assets used by the storefront.
- `editor.py` — local editor for structured static data.
- `main.py` — local NiceGUI preview/bootstrap.
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow for the static site.

## Local preview

Run the local preview with:

```bash
python main.py
```

The local NiceGUI preview is separate from the static GitHub Pages deployment. The live `.ca` site is deployed from the static artifact prepared by `.github/workflows/pages.yml`.

For a quick static preview, you can also run:

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

## Deploying to GitHub Pages

The workflow `.github/workflows/pages.yml` runs on pushes to `main` or `master`, and can also be started manually with `workflow_dispatch`.

The workflow intentionally publishes the static artifact directly to the `gh-pages` branch instead of using `actions/deploy-pages`, because the Pages deployment action can become stuck polling `deployment_queued`. GitHub Pages should be configured once in repository settings to serve from the `gh-pages` branch at `/`.

During deployment, the workflow prepares `_site` by copying:

- `index.html`
- `main.js`
- `CNAME`
- `_headers` when present
- `assets/`
- `logo.png` and `banner.png` when present

The workflow also verifies the deploy artifact before upload. It checks that:

- `_site/CNAME` contains `lacuisinederosalie.ca`
- `_site/index.html` contains `Nous ouvrons le 8 juillet.`
- `_site/index.html` contains the cache-busted script reference `main.js?v=20260702-opening-gate`

If GitHub Actions has stale runs, the workflow is configured with `cancel-in-progress: true` so newer runs cancel older queued/in-progress runs.

## Updating public content

The public storefront reads committed files from `assets/data/` and `assets/images/`. After editing data locally, commit and push the changed static files so GitHub Pages can deploy them.

See `docs/DEPLOYMENT.md` for more deployment notes.
