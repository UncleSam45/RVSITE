# Déploiement — La cuisine de Rosalie

## Pourquoi une modification dans `editor.py` peut sembler ne rien changer

L’éditeur ne modifie pas directement un site déjà publié sur Netlify, Vercel,
GitHub Pages ou un autre hébergeur. Il sauvegarde les fichiers dans cette copie
locale du projet. Le site public lit ensuite ces fichiers statiques:

- `assets/data/settings.json`
- `assets/data/menus.json`
- `assets/data/items.json`
- `assets/data/delivery.json`
- `assets/data/promotions.json`
- `assets/data/content.json`
- `assets/data/gallery.json`
- `assets/images/**` pour les photos téléversées par l’éditeur

Donc, après avoir cliqué **Save all** ou après avoir téléversé une image dans
l’éditeur, il faut aussi publier ces fichiers modifiés. Selon l’hébergement,
cela veut dire soit faire un commit/push Git pour déclencher un déploiement,
soit téléverser manuellement les dossiers `assets/data/` et `assets/images/`.
Le fichier `data/items.json` et la base SQLite de l’éditeur servent seulement à
la compatibilité/audit local; la page publique ne les utilise pas.

## Vérification locale avant publication

1. Lancer l’éditeur: `python editor.py`.
2. Faire les changements, puis cliquer **Save all**.
3. Lancer le site de prévisualisation: `python main.py`.
4. Ouvrir l’adresse locale affichée dans le terminal et faire un rafraîchissement
   complet du navigateur.
5. Si la prévisualisation locale est correcte, publier les fichiers modifiés.

Le JavaScript ajoute aussi un paramètre cache-buster quand il charge les JSON de
`assets/data/` afin d’éviter qu’un navigateur ou un CDN conserve une ancienne
version des menus après un déploiement.

## Site statique

Le site public charge `index.html`, `main.js`, les données JSON dans
`assets/data/` et les images dans `assets/images/`. Il peut être servi par
NiceGUI localement (`python main.py`) ou publié tel quel comme site statique.

## GitHub Pages

Ce dépôt contient maintenant un workflow GitHub Actions (`.github/workflows/pages.yml`)
qui publie automatiquement les fichiers statiques requis depuis la racine du
dépôt vers GitHub Pages. Il copie seulement `index.html`, `main.js`, `assets/`,
`logo.png` et `banner.png` dans l'artefact publié.

Si GitHub Pages affiche une erreur du type `docs/index.html` manquant, c'est que
la source Pages du dépôt pointe probablement vers le dossier `/docs`. Ce dossier
contient la documentation, pas le site public. Dans GitHub, allez dans
**Settings → Pages → Build and deployment**, puis choisissez **GitHub Actions**
comme source et lancez le workflow **Deploy static site to GitHub Pages**.

## Stripe Checkout

Le navigateur ne doit jamais contenir la clé secrète Stripe. Déployez
`serverless/create-checkout-session.js` sur Netlify, Vercel ou adaptez-le à
Cloudflare Workers.

Variables d’environnement requises:

- `STRIPE_SECRET_KEY`
- `PUBLIC_SITE_URL`

Le navigateur envoie seulement les identifiants d’items, portions, quantités,
date de livraison et coordonnées. La fonction valide les prix officiels depuis
les JSON avant de créer la session Stripe.
