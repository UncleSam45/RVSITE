const appData = {
  brand: 'Harvest & Hearth',
  tagline: 'Local Cooking Studio & Weekly Meal Craft',
  nav: [
    'ACCUEIL',
    'MENUS',
    'SPÉCIAL DU JOUR',
    'CONTACT',
  ],
  iconNav: [
    { icon: '🛒', label: 'Panier' },
    { icon: '👤', label: 'Compte' },
  ],
  categories: ['All', 'Seasonal', 'Family Packs', 'Vegetarian', 'Desserts'],
  highlights: [
    {
      title: 'Garden Harvest Bowl',
      description: 'Roasted market vegetables, lemon-herb grains, and whipped feta.',
      price: '$14',
      badge: 'Best Seller',
    },
    {
      title: 'Slow-Braised Beef Pot',
      description: 'Red wine reduction, glazed roots, and creamy potato mash.',
      price: '$18',
      badge: 'Chef Pick',
    },
    {
      title: 'Citrus Flame Salmon',
      description: 'Charred salmon with bright citrus glaze and wild rice medley.',
      price: '$19',
      badge: 'New',
    },
  ],
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      color-scheme: dark;
      --bg: #0a0e14;
      --panel: rgba(255,255,255,0.06);
      --line: rgba(255,255,255,0.14);
      --text: #f8fafc;
      --muted: #b0b8c4;
      --primary: #f5b970;
      --accent: #f38b75;
      --good: #8bd4a7;
      --shadow: 0 30px 70px rgba(0,0,0,0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at 20% 0%, #182236 0%, var(--bg) 42%), var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
    .site {
      width: 100%;
      margin: 0;
      padding: clamp(0.75rem, 1.5vw, 1.5rem);
    }
    .container {
      width: min(1600px, 100% - clamp(0.75rem, 2vw, 2rem));
      margin-inline: auto;
    }
    .topbar {
      position: sticky;
      top: 1rem;
      z-index: 10;
      backdrop-filter: blur(16px);
      background: rgba(9, 14, 23, 0.72);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 0.8rem 1rem;
      box-shadow: var(--shadow);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .brand { font-weight: 700; letter-spacing: 0.02em; }
    .nav { display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: center; }
    .tab {
      border: 1px solid transparent;
      color: var(--muted);
      padding: 0.45rem 0.75rem;
      border-radius: 999px;
      font-size: 0.92rem;
      transition: 180ms ease;
    }
    .tab:hover, .tab.active {
      color: var(--text);
      border-color: var(--line);
      background: rgba(255,255,255,0.06);
    }
    .tab.icon-tab {
      padding: 0.45rem 0.6rem;
      font-size: 1rem;
      line-height: 1;
    }
    .hero {
      margin-top: 1.1rem;
      border-radius: 24px;
      border: 1px solid var(--line);
      padding: 2.5rem;
      background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02));
      box-shadow: var(--shadow);
    }
    .kicker { color: var(--good); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; font-size: .78rem; }
    h1 { margin: .6rem 0; font-size: clamp(2rem, 3vw, 3.25rem); line-height: 1.1; }
    .lead { color: var(--muted); max-width: 60ch; margin-bottom: 1.5rem; }
    .actions { display: flex; gap: .7rem; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--line);
      background: rgba(255,255,255,.04);
      color: var(--text);
      padding: .7rem 1rem;
      border-radius: 12px;
      font-weight: 600;
    }
    .btn.primary { background: linear-gradient(125deg, var(--primary), var(--accent)); color: #1e130b; border: none; }
    .section { margin-top: 2rem; }
    .section h2 { margin: 0 0 .9rem; font-size: 1.35rem; }
    .chips { display: flex; gap: .6rem; flex-wrap: wrap; }
    .chip {
      border: 1px solid var(--line);
      padding: .45rem .75rem;
      border-radius: 10px;
      color: var(--muted);
      font-size: .9rem;
    }
    .cards { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
    .card {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      padding: 1rem;
      display: grid;
      gap: .65rem;
    }
    .badge { width: fit-content; font-size: .72rem; padding: .3rem .55rem; border-radius: 999px; background: rgba(139,212,167,.16); color: var(--good); }
    .card h3 { margin: 0; }
    .card p { margin: 0; color: var(--muted); }
    .price { font-weight: 700; color: var(--primary); }
    @media (max-width: 900px) {
      .topbar { flex-direction: column; align-items: stretch; }
      .nav { justify-content: center; }
      .hero { padding: 1.4rem; }
    }
    @media (min-width: 1500px) {
      .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
  `;
  document.head.appendChild(style);
}

function render(root) {
  const site = el('div', 'site');

  const topbarWrap = el('div', 'container');
  const topbar = el('header', 'topbar');
  topbar.append(el('div', 'brand', appData.brand));
  const nav = el('nav', 'nav');
  appData.nav.forEach((item, idx) => {
    nav.append(el('span', `tab ${idx === 0 ? 'active' : ''}`, item));
  });
  appData.iconNav.forEach((item) => {
    const iconTab = el('span', 'tab icon-tab', item.icon);
    iconTab.setAttribute('aria-label', item.label);
    iconTab.title = item.label;
    nav.append(iconTab);
  });
  topbar.append(nav);
  topbarWrap.append(topbar);

  const heroWrap = el('div', 'container');
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Handcrafted local kitchen'));
  hero.append(el('h1', '', 'Seasonal meals crafted for your week.'));
  hero.append(el('p', 'lead', 'A modern local cooking business website shell: polished, inviting, and ready for menus, ordering, and Stripe-powered checkout integration.'));
  const actions = el('div', 'actions');
  actions.append(el('button', 'btn primary', 'Explore Menu'));
  actions.append(el('button', 'btn', 'Plan Catering'));
  hero.append(actions);
  heroWrap.append(hero);

  const menuWrap = el('div', 'container');
  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Menu Categories'));
  const chips = el('div', 'chips');
  appData.categories.forEach((c, i) => chips.append(el('span', `chip ${i === 0 ? 'active' : ''}`, c)));
  menuSection.append(chips);
  menuWrap.append(menuSection);

  const cardWrap = el('div', 'container');
  const cardSection = el('section', 'section');
  cardSection.append(el('h2', '', 'Featured This Week'));
  const cards = el('div', 'cards');
  appData.highlights.forEach((item) => {
    const card = el('article', 'card');
    card.append(el('div', 'badge', item.badge));
    card.append(el('h3', '', item.title));
    card.append(el('p', '', item.description));
    card.append(el('div', 'price', item.price));
    cards.append(card);
  });
  cardSection.append(cards);
  cardWrap.append(cardSection);

  site.append(topbarWrap, heroWrap, menuWrap, cardWrap);
  root.innerHTML = '';
  root.append(site);
}

window.webframe = {
  version: '1.0.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
