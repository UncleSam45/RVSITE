async function loadAppData() {
  return fetch('./data/items.json').then((r) => r.json());
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
    body { margin: 0; background: radial-gradient(circle at 20% 0%, #182236 0%, var(--bg) 42%), var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .topbar-brand { display: inline-flex; align-items: center; gap: .85rem; min-width: 0; }
    .brand-logo-wrap { width: clamp(54px, 4.2vw, 68px); aspect-ratio: 1 / 1; border-radius: 14px; background: linear-gradient(155deg, rgba(255,255,255,.12), rgba(255,255,255,.04)); border: 1px solid rgba(255,255,255,.2); display: grid; place-items: center; box-shadow: 0 10px 25px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.12); flex: 0 0 auto; overflow: hidden; }
    .brand-logo { width: 82%; height: 82%; object-fit: contain; display: block; filter: drop-shadow(0 7px 12px rgba(0,0,0,.38)); }
    .brand-wordmark { font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif; font-size: clamp(1rem, 1.35vw, 1.3rem); letter-spacing: .08em; font-weight: 700; text-transform: uppercase; color: #fff8ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .site { width: 100%; margin: 0; padding: clamp(0.75rem, 1.5vw, 1.5rem); }
    .container { width: min(1600px, 100% - clamp(0.75rem, 2vw, 2rem)); margin-inline: auto; }
    .topbar { position: sticky; top: 1rem; z-index: 10; backdrop-filter: blur(16px); background: rgba(9, 14, 23, 0.72); border: 1px solid var(--line); border-radius: 16px; padding: 0.8rem 1rem; box-shadow: var(--shadow); display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .brand { font-weight: 700; letter-spacing: 0.02em; }
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
    .actions { display: flex; gap: .7rem; flex-wrap: wrap; }
    .btn { border: 1px solid var(--line); background: rgba(255,255,255,.04); color: var(--text); padding: .7rem 1rem; border-radius: 12px; font-weight: 600; }
    .btn.primary { background: linear-gradient(125deg, var(--primary), var(--accent)); color: #1e130b; border: none; }
    .section { margin-top: 2rem; }
    .section h2 { margin: 0 0 .9rem; font-size: 1.35rem; }
    .chips { display: flex; gap: .6rem; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); padding: .45rem .75rem; border-radius: 10px; color: var(--muted); font-size: .9rem; }
    .cards { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
    .card { border: 1px solid var(--line); border-radius: 16px; background: var(--panel); padding: 1rem; display: grid; gap: .65rem; }
    .badge { width: fit-content; font-size: .72rem; padding: .3rem .55rem; border-radius: 999px; background: rgba(139,212,167,.16); color: var(--good); }
    .card h3 { margin: 0; }
    .card p { margin: 0; color: var(--muted); }
    .price { font-weight: 700; color: var(--primary); }
    .empty-panel { border-radius: 24px; border: 1px solid var(--line); background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02)); box-shadow: var(--shadow); min-height: 360px; padding: 2rem; display: grid; align-content: center; justify-items: center; text-align: center; gap: .8rem; }
    .panel-title { margin: 0; font-size: clamp(1.6rem, 2.6vw, 2.6rem); }
    .panel-subtitle { margin: 0; color: var(--muted); max-width: 55ch; }
    .placeholder { width: min(900px, 100%); min-height: 180px; border: 1px dashed var(--line); border-radius: 16px; background: var(--panel); }
    @media (max-width: 900px) { .topbar { flex-direction: column; align-items: stretch; } .topbar-brand { justify-content: center; } .brand-wordmark { text-align: center; } .nav { justify-content: center; } .hero { padding: 1.4rem; } .empty-panel { min-height: 300px; padding: 1.25rem; } }
    @media (min-width: 1500px) { .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
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
  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button.dataset.tabId));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabButtons.length - 1;
      const nextButton = tabButtons[nextIndex];
      nextButton.focus();
      activateTab(nextButton.dataset.tabId);
    });
  });
  activateTab(tabButtons[0]?.dataset.tabId);
}

function buildHomePanel(panel, appData) {
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Handcrafted local kitchen'));
  hero.append(el('h1', '', 'Seasonal meals crafted for your week.'));
  hero.append(el('p', 'lead', appData.tagline || 'A modern local cooking business website shell: polished, inviting, and ready for menus, ordering, and Stripe-powered checkout integration.'));
  const actions = el('div', 'actions');
  actions.append(el('button', 'btn primary', 'Explore Menu'));
  actions.append(el('button', 'btn', 'Plan Catering'));
  hero.append(actions);

  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Menu Categories'));
  const chips = el('div', 'chips');
  (appData.categories || []).forEach((c, i) => chips.append(el('span', `chip ${i === 0 ? 'active' : ''}`, c)));
  menuSection.append(chips);

  const cardSection = el('section', 'section');
  cardSection.append(el('h2', '', 'Featured This Week'));
  const cards = el('div', 'cards');
  (appData.items || []).filter((item) => item.featured).forEach((item) => {
    const card = el('article', 'card');
    card.append(el('div', 'badge', item.badge || 'Featured'));
    card.append(el('h3', '', item.title));
    card.append(el('p', '', item.description));
    card.append(el('div', 'price', `$${item.price}`));
    cards.append(card);
  });
  cardSection.append(cards);

  panel.append(hero, menuSection, cardSection);
}

function buildEmptyPanel(panel, label) {
  const empty = el('div', 'empty-panel');
  empty.append(el('h2', 'panel-title', label));
  empty.append(el('p', 'panel-subtitle', 'Section prête: espace réservé pour votre contenu.'));
  empty.append(el('div', 'placeholder'));
  panel.append(empty);
}

function render(root, appData) {
  const site = el('div', 'site');
  const topbarWrap = el('div', 'container');
  const topbar = el('header', 'topbar');
  const brandWrap = el('div', 'topbar-brand');
  const logoWrap = el('div', 'brand-logo-wrap');
  const logo = document.createElement('img');
  logo.className = 'brand-logo';
  logo.src = appData.logo || './assets/images/restaurant-logo.png';
  logo.alt = `${appData.brand || 'Restaurant'} logo`;
  logo.loading = 'eager';
  logo.decoding = 'async';
  logo.addEventListener('error', () => { logo.style.display = 'none'; });
  logoWrap.append(logo);
  const wordmark = el('div', 'brand-wordmark', appData.brand || 'LA CUISINE DE ROSALIE');
  brandWrap.append(logoWrap, wordmark);
  topbar.append(brandWrap);
  const nav = el('div', 'nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Sections principales');

  const tabs = appData.tabs || [];
  const tabButtons = tabs.map((tab, idx) => {
    const button = el('button', 'tab', tab.label);
    button.type = 'button'; button.id = `tab-${tab.id}`; button.dataset.tabId = tab.id;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `panel-${tab.id}`);
    button.setAttribute('aria-selected', idx === 0 ? 'true' : 'false'); button.tabIndex = idx === 0 ? 0 : -1;
    nav.append(button); return button;
  });

  topbar.append(nav); topbarWrap.append(topbar);
  const panelWrap = el('div', 'container');
  const panels = tabs.map((tab, idx) => {
    const panel = el('section', 'tab-panel');
    panel.id = `panel-${tab.id}`; panel.dataset.tabPanel = tab.id;
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.hidden = idx !== 0;
    if (tab.id === 'home') buildHomePanel(panel, appData); else buildEmptyPanel(panel, tab.label);
    panelWrap.append(panel);
    return panel;
  });

  site.append(topbarWrap, panelWrap);
  root.innerHTML = ''; root.append(site);
  if (tabButtons.length) setupTabs(tabButtons, panels);
}

window.webframe = {
  version: '1.3.1',
  async init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap';
    document.head.appendChild(fontLink);
    injectStyles();
    const appData = await loadAppData();
    render(root, appData);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
