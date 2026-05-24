const appData = {
  brand: 'LA CUISINE DE ROSALIE',
  tagline: 'Local Cooking Studio & Weekly Meal Craft',
  tabs: [
    { id: 'home', label: 'ACCUEIL' },
    { id: 'menu', label: 'MENUS' },
    { id: 'special', label: 'SPÉCIAL DU JOUR' },
    { id: 'contact', label: 'CONTACT' },
  ],
  iconNav: [
    { icon: '👤', label: 'Compte' },
    { icon: '🛒', label: 'Panier' },
  ],
  categories: ['All'],
  highlights: [],
  items: [],
};

async function loadItems() {
  try {
    const response = await fetch('/assets/data/items.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load items: ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch (error) {
    console.warn('[webframe] Could not load items.json, using empty list.', error);
    return [];
  }
}

function normalizePrice(price) {
  return typeof price === 'number' ? `$${price}` : '';
}

function syncDataFromItems(items) {
  const availableItems = items.filter((item) => item?.available);
  const categorySet = new Set(['All']);

  availableItems.forEach((item) => {
    if (item?.category) categorySet.add(item.category);
  });

  appData.items = availableItems;
  appData.categories = Array.from(categorySet);
  appData.highlights = availableItems
    .filter((item) => item?.featured)
    .map((item) => ({
      title: item.title || 'Untitled Item',
      description: item.description || '',
      price: normalizePrice(item.price),
      badge: item.category || 'Featured',
      image: item.image || '',
      id: item.id || '',
    }));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root { color-scheme: light; --bg: #fffdf6; --panel: rgba(255,255,255,0.82); --line: rgba(229,190,93,0.34); --text: #3f2f18; --muted: #8f7b5b; --primary: #edc353; --accent: #f8db8b; --accent-strong: #d8a940; --good: #7aa35a; --shadow: 0 16px 40px rgba(219, 174, 67, 0.24); }
    * { box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
    body { margin: 0; background: radial-gradient(circle at 10% 8%, #fff4cf 0%, rgba(255, 244, 207, 0.3) 24%, transparent 56%), radial-gradient(circle at 84% 18%, #fff2bc 0%, rgba(255, 242, 188, 0.18) 30%, transparent 68%), var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .site { width: 100%; margin: 0; padding: clamp(0.4rem, 1vw, 0.9rem); }
    .container { width: min(1600px, 100% - clamp(0.75rem, 2vw, 2rem)); margin-inline: auto; }
    .topbar { position: sticky; top: 0.4rem; z-index: 10; backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.86); border: 1px solid var(--line); border-radius: 18px; padding: 0.35rem 0.9rem; box-shadow: 0 10px 24px rgba(165, 133, 38, 0.14); display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .brand-wrap { display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1 1 auto; }
    .brand-logo { width: clamp(78px, 7vw, 110px); height: clamp(78px, 7vw, 110px); object-fit: contain; object-position: center; background: transparent; border: 0; box-shadow: none; flex: 0 0 auto; }
    .brand-title { width: clamp(230px, 24vw, 420px); max-width: 100%; max-height: 64px; height: auto; object-fit: contain; object-position: left center; background: transparent; border: 0; box-shadow: none; display: block; }
    .nav { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; justify-content: flex-end; margin-block: 0.1rem; }
    .tab { border: 1px solid transparent; color: var(--muted); padding: 0.48rem 0.8rem; border-radius: 999px; font-size: 0.9rem; transition: 180ms ease; background: transparent; cursor: pointer; font-weight: 600; white-space: nowrap; }
    .tab:hover, .tab[aria-selected="true"] { color: var(--text); border-color: var(--line); background: rgba(248,219,139,0.35); }
    .tab.icon-tab { padding: 0.4rem 0.56rem; font-size: 1rem; line-height: 1; }
    @media (max-width: 980px) { .topbar { flex-wrap: wrap; align-items: center; padding: 0.45rem 0.7rem; } .brand-wrap { width: 100%; justify-content: center; } .brand-logo { width: clamp(72px, 12vw, 94px); height: clamp(72px, 12vw, 94px); } .brand-title { width: clamp(220px, 56vw, 360px); max-height: 60px; } .nav { width: 100%; justify-content: center; } }
    .tab-panel { margin-top: 1.1rem; }
    .tab-panel[hidden] { display: none; }
    .hero { border-radius: 28px; border: 1px solid var(--line); padding: 2.5rem; background: linear-gradient(160deg, rgba(255,252,241,.96), rgba(255,243,204,.9) 42%, rgba(255,255,255,.9)); box-shadow: var(--shadow); position: relative; overflow: hidden; }
    .hero::before, .hero::after { content: ''; position: absolute; border-radius: 999px; pointer-events: none; }
    .hero::before { width: 220px; height: 220px; right: -90px; top: -75px; background: radial-gradient(circle at center, rgba(237,195,83,.45), rgba(237,195,83,0)); }
    .hero::after { width: 180px; height: 180px; left: -70px; bottom: -70px; background: radial-gradient(circle at center, rgba(248,219,139,.55), rgba(248,219,139,0)); }
    .kicker { color: var(--good); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; font-size: .78rem; }
    h1 { margin: .6rem 0; font-size: clamp(2rem, 3vw, 3.25rem); line-height: 1.1; font-family: "Cormorant Garamond", serif; }
    .lead { color: var(--muted); max-width: 60ch; margin-bottom: 1.5rem; }
    .hero-cta { border: 0; border-radius: 999px; padding: .68rem 1.15rem; font-weight: 700; color: #4a3618; background: linear-gradient(180deg, #ffe8a1, #f3c95d); box-shadow: 0 10px 18px rgba(173, 133, 35, .25); cursor: pointer; }
    .hero-cta:hover { transform: translateY(-1px); filter: saturate(1.05); }
    .section { margin-top: 2rem; }
    .section h2 { margin: 0 0 .9rem; font-size: 1.35rem; }
    .chips { display: flex; gap: .6rem; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); padding: .45rem .75rem; border-radius: 10px; color: #7e6643; font-size: .9rem; background: rgba(255,255,255,0.75); }
    .cards { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
    .card { border: 1px solid var(--line); border-radius: 16px; background: var(--panel); overflow: hidden; display: grid; box-shadow: 0 12px 22px rgba(194, 154, 56, 0.12); }
    .card-media { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.05); }
    .card-content { padding: 1rem; display: grid; gap: .65rem; }
    .badge { width: fit-content; font-size: .72rem; padding: .3rem .55rem; border-radius: 999px; background: rgba(122,163,90,.16); color: var(--good); }
    .card h3 { margin: 0; }
    .card p { margin: 0; color: var(--muted); }
    .price { font-weight: 700; color: var(--primary); }
    .empty-state { color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; padding: 1rem; }
    .empty-panel { border-radius: 24px; border: 1px solid var(--line); background: linear-gradient(160deg, rgba(255,252,241,.96), rgba(255,243,204,.9) 42%, rgba(255,255,255,.9)); box-shadow: var(--shadow); min-height: 360px; padding: 2rem; display: grid; align-content: center; justify-items: center; text-align: center; gap: .8rem; }
    .panel-title { margin: 0; font-size: clamp(1.6rem, 2.6vw, 2.6rem); }
    .panel-subtitle { margin: 0; color: var(--muted); max-width: 55ch; }
    .placeholder { width: min(900px, 100%); min-height: 180px; border: 1px dashed var(--line); border-radius: 16px; background: var(--panel); }
  `;
  document.head.appendChild(style);
}

function setupTabs(tabButtons, panels) {
  const activateTab = (tabId) => {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tabId === tabId;
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tabId; });
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tabId));
  });

  activateTab(tabButtons[0]?.dataset.tabId);
}

function buildMenuCards(target, items) {
  const cards = el('div', 'cards');

  items.forEach((item) => {
    const card = el('article', 'card');
    const image = el('img', 'card-media');
    image.src = item.image || '';
    image.alt = item.title || 'Menu item image';
    image.loading = 'lazy';

    const content = el('div', 'card-content');
    content.append(el('div', 'badge', item.category || 'Menu'));
    content.append(el('h3', '', item.title || 'Untitled Item'));
    content.append(el('p', '', item.description || ''));
    content.append(el('div', 'price', normalizePrice(item.price)));

    card.append(image, content);
    cards.append(card);
  });

  target.append(cards);
}

function buildHomePanel(panel) {
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Family table • Fresh joy • Local love'));
  hero.append(el('h1', '', 'Warm family catering for your happiest gatherings.'));
  hero.append(el('p', 'lead', 'From birthday tables to Sunday brunch, we prepare comforting seasonal dishes with a bright homemade touch—crafted to make every guest smile.'));
  hero.append(el('button', 'hero-cta', 'Plan Your Next Feast ✨'));
  panel.append(hero);

  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Menu Categories'));
  const chips = el('div', 'chips');
  appData.categories.forEach((category) => chips.append(el('span', 'chip', category)));
  menuSection.append(chips);

  const featuredSection = el('section', 'section');
  featuredSection.append(el('h2', '', 'Featured This Week'));
  if (appData.highlights.length > 0) {
    buildMenuCards(featuredSection, appData.highlights);
  } else {
    featuredSection.append(el('p', 'empty-state', 'No featured items yet.'));
  }

  panel.append(menuSection, featuredSection);
}

function buildMenuPanel(panel) {
  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Available Menu Items'));
  if (appData.items.length > 0) {
    buildMenuCards(menuSection, appData.items);
  } else {
    menuSection.append(el('p', 'empty-state', 'No available items in data/items.json yet.'));
  }
  panel.append(menuSection);
}

function buildEmptyPanel(panel, label) {
  const empty = el('div', 'empty-panel');
  empty.append(el('h2', 'panel-title', label));
  empty.append(el('p', 'panel-subtitle', 'Section prête: espace réservé pour votre contenu.'));
  empty.append(el('div', 'placeholder'));
  panel.append(empty);
}

function render(root) {
  const site = el('div', 'site');
  const topbarWrap = el('div', 'container');
  const topbar = el('header', 'topbar');
  const brandWrap = el('div', 'brand-wrap');
  const brandLogo = el('img', 'brand-logo');
  brandLogo.src = `/assets/logo.png?v=${window.webframe?.version || '1.3.1'}`;
  brandLogo.alt = `${appData.brand} logo`;
  brandLogo.loading = 'eager';
  const brandTitle = el('img', 'brand-title');
  brandTitle.src = `/assets/title.png?v=${window.webframe?.version || '1.3.2'}`;
  brandTitle.alt = appData.brand;
  brandTitle.loading = 'eager';
  brandWrap.append(brandLogo, brandTitle);
  topbar.append(brandWrap);

  const nav = el('div', 'nav');
  nav.setAttribute('role', 'tablist');

  const tabButtons = appData.tabs.map((tab) => {
    const button = el('button', 'tab', tab.label);
    button.type = 'button';
    button.dataset.tabId = tab.id;
    nav.append(button);
    return button;
  });

  appData.iconNav.forEach((item) => {
    const iconTab = el('button', 'tab icon-tab', item.icon);
    iconTab.type = 'button';
    iconTab.setAttribute('aria-label', item.label);
    nav.append(iconTab);
  });

  topbar.append(nav);
  topbarWrap.append(topbar);

  const panelWrap = el('div', 'container');
  const panels = appData.tabs.map((tab, idx) => {
    const panel = el('section', 'tab-panel');
    panel.dataset.tabPanel = tab.id;
    panel.hidden = idx !== 0;

    if (tab.id === 'home') buildHomePanel(panel);
    else if (tab.id === 'menu') buildMenuPanel(panel);
    else buildEmptyPanel(panel, tab.label);

    panelWrap.append(panel);
    return panel;
  });

  site.append(topbarWrap, panelWrap);
  root.innerHTML = '';
  root.append(site);
  setupTabs(tabButtons, panels);
}

window.webframe = {
  version: '1.3.2',
  async init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;

    const items = await loadItems();
    syncDataFromItems(items);
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
