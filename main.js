const appData = {
  brand: 'LA CUISINE DE ROSALIE',
  tagline: 'Boutique Catering • Crafted Locally',
  tabs: [
    { id: 'home', label: 'HOME' },
    { id: 'menu', label: 'MENU' },
    { id: 'special', label: 'EVENTS' },
    { id: 'contact', label: 'CONTACT' },
  ],
  iconNav: [
    { icon: '☎️', label: 'Call' },
    { icon: '🛒', label: 'Cart' },
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

function normalizePrice(item) {
  const pricing = item?.pricing;
  if (pricing && typeof pricing === 'object') {
    const small = pricing.small_meal != null ? `$${pricing.small_meal}` : '';
    const large = pricing.large_meal != null ? `$${pricing.large_meal}` : '';
    const family = pricing.family_format != null ? `${pricing.family_format}` : '';
    const parts = [];
    if (small) parts.push(`Small: ${small}`);
    if (large) parts.push(`Large: ${large}`);
    if (family) parts.push(`Family: ${family}`);
    if (parts.length) return parts.join(' • ');
    if (pricing.base_price != null) return `$${pricing.base_price}`;
    if (pricing.price_range != null) return `$${pricing.price_range}`;
  }
  const legacyPrice = item?.price;
  return typeof legacyPrice === 'number' ? `$${legacyPrice}` : '';
}

function isFeatured(item) {
  if (!item) return false;
  if (typeof item.featured === 'boolean') return item.featured;
  if (typeof item.featured === 'string') return item.featured.trim().toLowerCase() === 'true';
  if (typeof item.featured === 'number') return item.featured === 1;
  return false;
}

function syncDataFromItems(items) {
  const availableItems = items.filter((item) => item?.available);
  const categorySet = new Set(['All']);

  availableItems.forEach((item) => {
    if (item?.category) categorySet.add(item.category);
  });

  appData.items = availableItems;
  appData.categories = Array.from(categorySet);
  appData.highlights = availableItems.filter((item) => isFeatured(item));
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
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
    :root { color-scheme: light; --bg: #f6f4f1; --card: #ffffff; --line: #e7e1d9; --text: #1e1e1e; --muted: #5f5a54; --accent: #b88442; --accent-dark: #8b5e29; --success: #3f7456; --shadow: 0 14px 34px rgba(18, 14, 8, 0.09); }
    * { box-sizing: border-box; }
    body { margin: 0; background: linear-gradient(180deg, #f8f5f1 0%, #f3efe8 100%); color: var(--text); font-family: Inter, system-ui, -apple-system, sans-serif; }
    .site { padding: clamp(0.8rem, 2vw, 1.6rem); }
    .container { width: min(1260px, 100% - 1rem); margin-inline: auto; }
    .topbar { position: sticky; top: 0.8rem; z-index: 40; backdrop-filter: blur(12px); background: rgba(255,255,255,0.88); border: 1px solid var(--line); border-radius: 18px; padding: 0.7rem 1rem; box-shadow: var(--shadow); display: flex; align-items: center; gap: 1rem; justify-content: space-between; }
    .brand-wrap { display: flex; align-items: center; gap: 0.8rem; min-width: 0; flex: 1; }
    .brand-logo { width: 74px; height: 74px; object-fit: contain; }
    .brand-title { width: min(360px, 48vw); max-height: 58px; object-fit: contain; object-position: left; }
    .nav { display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: flex-end; }
    .tab { border: 1px solid transparent; color: var(--muted); background: transparent; border-radius: 999px; padding: 0.52rem 0.9rem; font-weight: 600; cursor: pointer; }
    .tab:hover, .tab[aria-selected="true"] { color: #21180e; border-color: #d5c8b8; background: #f4ede5; }
    .tab.icon-tab { padding-inline: 0.65rem; }
    .tab-panel { margin-top: 1.4rem; }
    .tab-panel[hidden] { display: none; }
    .hero { border-radius: 24px; border: 1px solid var(--line); background: linear-gradient(130deg, rgba(255,255,255,0.95), rgba(247,241,234,0.95)); box-shadow: var(--shadow); padding: clamp(1.5rem, 4vw, 3rem); }
    .kicker { color: var(--success); text-transform: uppercase; letter-spacing: .08em; font-size: .76rem; font-weight: 700; }
    h1 { margin: .7rem 0; line-height: 1.1; font-size: clamp(2rem, 4vw, 3.5rem); font-family: 'Playfair Display', Georgia, serif; }
    .lead { max-width: 65ch; color: var(--muted); margin-bottom: 1.3rem; }
    .hero-cta { border: 0; border-radius: 999px; font-weight: 700; padding: 0.75rem 1.2rem; cursor: pointer; color: #fff; background: linear-gradient(180deg, #ba8447, #9e6d35); box-shadow: 0 10px 20px rgba(139, 94, 41, 0.28); }
    .section { margin-top: 2rem; }
    .section h2 { margin: 0 0 .85rem; font-size: 1.25rem; }
    .chips { display: flex; gap: .55rem; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); border-radius: 999px; padding: .42rem .75rem; background: #fff; color: #544f48; font-size: .88rem; }
    .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 20px rgba(21, 14, 6, 0.08); }
    .card-media { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; background: #ede7de; }
    .card-content { padding: 0.95rem; display: grid; gap: .55rem; }
    .badge { width: fit-content; font-size: .72rem; letter-spacing: .04em; text-transform: uppercase; padding: .24rem .5rem; border-radius: 999px; background: #f4eee5; color: #6e4b24; }
    .card h3 { margin: 0; font-size: 1.03rem; }
    .card p { margin: 0; color: var(--muted); font-size: .94rem; }
    .price { margin-top: .2rem; font-weight: 700; color: var(--accent-dark); }
    .empty-state { color: var(--muted); border: 1px dashed #d3c7b9; border-radius: 12px; padding: 1rem; background: #fcfaf7; }
    .empty-panel { border-radius: 22px; border: 1px solid var(--line); min-height: 320px; padding: 2rem; display: grid; place-items: center; text-align: center; gap: .6rem; background: #fff; box-shadow: var(--shadow); }
    .panel-title { margin: 0; font-size: clamp(1.4rem, 3vw, 2.4rem); }
    .panel-subtitle { margin: 0; color: var(--muted); }
    .placeholder { width: min(820px, 100%); min-height: 150px; border: 1px dashed #d8cec2; border-radius: 14px; }
    @media (max-width: 900px) { .topbar { flex-wrap: wrap; } .brand-wrap, .nav { width: 100%; justify-content: center; } .brand-title { object-position: center; } }
  `;
  document.head.appendChild(style);
}

function setupTabs(tabButtons, panels) { const activateTab = (tabId) => { tabButtons.forEach((button) => { const isActive = button.dataset.tabId === tabId; button.setAttribute('aria-selected', String(isActive)); button.tabIndex = isActive ? 0 : -1; }); panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tabId; }); }; tabButtons.forEach((button) => { button.addEventListener('click', () => activateTab(button.dataset.tabId)); }); activateTab(tabButtons[0]?.dataset.tabId); }

function buildMenuCards(target, items) {
  const cards = el('div', 'cards');
  items.forEach((item) => {
    const card = el('article', 'card');
    const image = el('img', 'card-media');
    image.src = item.image || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80';
    image.alt = item.title || 'Menu item image';
    image.loading = 'lazy';
    const content = el('div', 'card-content');
    content.append(el('div', 'badge', item.category || 'Menu'));
    content.append(el('h3', '', item.title || 'Untitled Item'));
    content.append(el('p', '', item.description || ''));
    content.append(el('div', 'price', normalizePrice(item)));
    card.append(image, content);
    cards.append(card);
  });
  target.append(cards);
}

function buildHomePanel(panel) {
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Local Town Caterer • Elevated Experience'));
  hero.append(el('h1', '', 'Professional catering design and flavor for unforgettable gatherings.'));
  hero.append(el('p', 'lead', 'From intimate family milestones to large community celebrations, our kitchen delivers polished presentation, comforting flavors, and smooth service that feels restaurant-quality from first bite to final toast.'));
  hero.append(el('button', 'hero-cta', 'Book Your Catering Date'));
  panel.append(hero);

  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Menu Categories'));
  const chips = el('div', 'chips');
  appData.categories.forEach((category) => chips.append(el('span', 'chip', category)));
  menuSection.append(chips);

  const featuredSection = el('section', 'section');
  featuredSection.append(el('h2', '', 'Featured Selections'));
  if (appData.highlights.length > 0) buildMenuCards(featuredSection, appData.highlights);
  else featuredSection.append(el('p', 'empty-state', 'No featured items yet.'));

  panel.append(menuSection, featuredSection);
}

function buildMenuPanel(panel) { const menuSection = el('section', 'section'); menuSection.append(el('h2', '', 'Available Menu Items')); if (appData.items.length > 0) buildMenuCards(menuSection, appData.items); else menuSection.append(el('p', 'empty-state', 'No available items in data/items.json yet.')); panel.append(menuSection); }
function buildEmptyPanel(panel, label) { const empty = el('div', 'empty-panel'); empty.append(el('h2', 'panel-title', label)); empty.append(el('p', 'panel-subtitle', 'Reserved section: we can next add booking flow, packages, or contact forms here.')); empty.append(el('div', 'placeholder')); panel.append(empty); }

function render(root) {
  const site = el('div', 'site');
  const topbarWrap = el('div', 'container');
  const topbar = el('header', 'topbar');
  const brandWrap = el('div', 'brand-wrap');
  const brandLogo = el('img', 'brand-logo');
  brandLogo.src = `/assets/logo.png?v=${window.webframe?.version || '1.4.0'}`;
  brandLogo.alt = `${appData.brand} logo`;
  brandLogo.loading = 'eager';
  const brandTitle = el('img', 'brand-title');
  brandTitle.src = `/assets/title.png?v=${window.webframe?.version || '1.4.0'}`;
  brandTitle.alt = appData.brand;
  brandTitle.loading = 'eager';
  brandWrap.append(brandLogo, brandTitle);
  topbar.append(brandWrap);
  const nav = el('div', 'nav');
  nav.setAttribute('role', 'tablist');
  const tabButtons = appData.tabs.map((tab) => { const button = el('button', 'tab', tab.label); button.type = 'button'; button.dataset.tabId = tab.id; nav.append(button); return button; });
  appData.iconNav.forEach((item) => { const iconTab = el('button', 'tab icon-tab', item.icon); iconTab.type = 'button'; iconTab.setAttribute('aria-label', item.label); nav.append(iconTab); });
  topbar.append(nav); topbarWrap.append(topbar);

  const panelWrap = el('div', 'container');
  const panels = appData.tabs.map((tab, idx) => {
    const panel = el('section', 'tab-panel');
    panel.dataset.tabPanel = tab.id;
    panel.hidden = idx !== 0;
    if (tab.id === 'home') buildHomePanel(panel); else if (tab.id === 'menu') buildMenuPanel(panel); else buildEmptyPanel(panel, tab.label);
    panelWrap.append(panel);
    return panel;
  });

  site.append(topbarWrap, panelWrap);
  root.innerHTML = '';
  root.append(site);
  setupTabs(tabButtons, panels);
}

window.webframe = {
  version: '1.4.0',
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
