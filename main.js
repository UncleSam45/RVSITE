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
    :root { color-scheme: dark; --bg: #0a0e14; --panel: rgba(255,255,255,0.06); --line: rgba(255,255,255,0.14); --text: #f8fafc; --muted: #b0b8c4; --primary: #f5b970; --accent: #f38b75; --good: #8bd4a7; --shadow: 0 30px 70px rgba(0,0,0,0.35); }
    * { box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
    body { margin: 0; background: radial-gradient(circle at 20% 0%, #182236 0%, var(--bg) 42%), var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .site { width: 100%; margin: 0; padding: clamp(0.75rem, 1.5vw, 1.5rem); }
    .container { width: min(1600px, 100% - clamp(0.75rem, 2vw, 2rem)); margin-inline: auto; }
    .topbar { position: sticky; top: 1rem; z-index: 10; backdrop-filter: blur(16px); background: rgba(9, 14, 23, 0.72); border: 1px solid var(--line); border-radius: 16px; padding: 0.8rem 1rem; box-shadow: var(--shadow); display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .brand-wrap { display: flex; align-items: center; gap: 1rem; min-width: 0; }
    .brand-logo { width: clamp(88px, 8vw, 124px); height: clamp(88px, 8vw, 124px); object-fit: contain; background: transparent; border: 0; box-shadow: none; flex: 0 0 auto; }
    .brand { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; font-size: clamp(1.1rem, 1.3vw, 1.45rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav { display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: center; }
    .tab { border: 1px solid transparent; color: var(--muted); padding: 0.45rem 0.75rem; border-radius: 999px; font-size: 0.92rem; transition: 180ms ease; background: transparent; cursor: pointer; }
    .tab:hover, .tab[aria-selected="true"] { color: var(--text); border-color: var(--line); background: rgba(255,255,255,0.06); }
    .tab.icon-tab { padding: 0.45rem 0.6rem; font-size: 1rem; line-height: 1; }
    .tab-panel { margin-top: 1.1rem; }
    .tab-panel[hidden] { display: none; }
    .hero { border-radius: 24px; border: 1px solid var(--line); padding: 2.5rem; background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02)); box-shadow: var(--shadow); }
    .kicker { color: var(--good); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; font-size: .78rem; }
    h1 { margin: .6rem 0; font-size: clamp(2rem, 3vw, 3.25rem); line-height: 1.1; }
    .lead { color: var(--muted); max-width: 60ch; margin-bottom: 1.5rem; }
    .section { margin-top: 2rem; }
    .section h2 { margin: 0 0 .9rem; font-size: 1.35rem; }
    .chips { display: flex; gap: .6rem; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); padding: .45rem .75rem; border-radius: 10px; color: var(--muted); font-size: .9rem; }
    .cards { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
    .card { border: 1px solid var(--line); border-radius: 16px; background: var(--panel); overflow: hidden; display: grid; }
    .card-media { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.05); }
    .card-content { padding: 1rem; display: grid; gap: .65rem; }
    .badge { width: fit-content; font-size: .72rem; padding: .3rem .55rem; border-radius: 999px; background: rgba(139,212,167,.16); color: var(--good); }
    .card h3 { margin: 0; }
    .card p { margin: 0; color: var(--muted); }
    .price { font-weight: 700; color: var(--primary); }
    .empty-state { color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; padding: 1rem; }
    .empty-panel { border-radius: 24px; border: 1px solid var(--line); background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02)); box-shadow: var(--shadow); min-height: 360px; padding: 2rem; display: grid; align-content: center; justify-items: center; text-align: center; gap: .8rem; }
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
  hero.append(el('div', 'kicker', 'Handcrafted local kitchen'));
  hero.append(el('h1', '', 'Seasonal meals crafted for your week.'));
  hero.append(el('p', 'lead', 'A modern local cooking business website shell: polished, inviting, and ready for menus, ordering, and Stripe-powered checkout integration.'));
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
  brandWrap.append(brandLogo, el('div', 'brand', appData.brand));
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
  version: '1.3.1',
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
