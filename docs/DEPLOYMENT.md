# Déploiement — La cuisine de Rosalie

## Site statique

Le site public charge `main.js` et les données JSON dans `assets/data/`. Il peut être servi par NiceGUI localement (`python main.py`) ou adapté à GitHub Pages en publiant les fichiers statiques.

## Données à publier

- `assets/data/settings.json`
- `assets/data/menus.json`
- `assets/data/items.json`
- `assets/data/delivery.json`
- `assets/data/promotions.json`
- `assets/data/content.json`

## Stripe Checkout

Le navigateur ne doit jamais contenir la clé secrète Stripe. Déployez `serverless/create-checkout-session.js` sur Netlify, Vercel ou adaptez-le à Cloudflare Workers.

Variables d’environnement requises:

- `STRIPE_SECRET_KEY`
- `PUBLIC_SITE_URL`

Le navigateur envoie seulement les identifiants d’items, portions, quantités, date de livraison et coordonnées. La fonction valide les prix officiels depuis les JSON avant de créer la session Stripe.
