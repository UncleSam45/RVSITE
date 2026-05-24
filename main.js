const appData = {
  brand: 'Harvest & Hearth',
  tagline: 'Local Cooking Studio & Weekly Meal Craft',
  tabs: [
    { id: 'overview', label: 'Overview' },
    { id: 'menu', label: 'Menu' },
    { id: 'contact', label: 'Contact' },
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
    .site { width: min(1280px, 100% - 2rem); margin: 1.5rem auto; }
    .shell {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: rgba(9, 14, 23, 0.75);
      box-shadow: var(--shadow);
      padding: 1rem;
    }
    .header h1 { margin: 0; font-size: clamp(1.6rem, 2.5vw, 2.4rem); }
    .header p { margin: 0.35rem 0 1rem; color: var(--muted); }
    .tabs { display: flex; gap: 0.6rem; border-bottom: 1px solid var(--line); padding-bottom: 0.8rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .tab { appearance: none; border: 1px solid transparent; background: transparent; color: var(--muted); padding: 0.55rem 0.9rem; border-radius: 999px; font-size: 0.95rem; cursor: pointer; transition: 180ms ease; }
    .tab:hover, .tab[aria-selected='true'] { color: var(--text); border-color: var(--line); background: rgba(255,255,255,0.06); }
    .panel { display: none; }
    .panel.active { display: block; }
    .hero { border: 1px solid var(--line); border-radius: 16px; padding: 1.5rem; background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02)); }
    .kicker { color: var(--good); font-weight: 600; letter-spacing: .05em; text-transform: uppercase; font-size: .78rem; }
    .hero h2 { margin: .5rem 0; font-size: clamp(1.5rem, 2.8vw, 2.4rem); }
    .lead { color: var(--muted); max-width: 65ch; }
    .section { margin-top: 1.1rem; }
    .chips { display:flex; gap:.5rem; flex-wrap: wrap; }
    .chip { border:1px solid var(--line); padding:.4rem .7rem; border-radius:10px; color:var(--muted); }
    .cards { margin-top: .8rem; display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .8rem; }
    .card { border:1px solid var(--line); border-radius:14px; background:var(--panel); padding: .9rem; }
    .badge { width: fit-content; font-size: .72rem; padding: .25rem .5rem; border-radius: 999px; background: rgba(139,212,167,.16); color: var(--good); }
    .card h3 { margin: .55rem 0; }
    .card p { margin:0; color:var(--muted); }
    .price { margin-top:.5rem; font-weight:700; color:var(--primary); }
    .placeholder-block { border:1px solid var(--line); border-radius: 14px; background: var(--panel); padding: 1rem; }
    .placeholder-block h3 { margin: 0 0 .4rem; }
    .placeholder-block p { margin: 0; color: var(--muted); line-height: 1.6; }
  `;
  document.head.appendChild(style);
}

function activateTab(tabId, tabs, panels) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.tabTarget === tabId;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
  });

  panels.forEach((panel) => {
    const active = panel.id === `panel-${tabId}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function buildOverviewPanel() {
  const wrap = el('div', '');
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Handcrafted local kitchen'));
  hero.append(el('h2', '', 'Seasonal meals crafted for your week.'));
  hero.append(el('p', 'lead', 'A fuller homepage layout with clear sections so the app does not feel empty while data integrations are still being built.'));
  wrap.append(hero);

  const categories = el('section', 'section');
  categories.append(el('h3', '', 'Menu Categories'));
  const chips = el('div', 'chips');
  appData.categories.forEach((c) => chips.append(el('span', 'chip', c)));
  categories.append(chips);
  wrap.append(categories);

  const featured = el('section', 'section');
  featured.append(el('h3', '', 'Featured This Week'));
  const cards = el('div', 'cards');
  appData.highlights.forEach((item) => {
    const card = el('article', 'card');
    card.append(el('div', 'badge', item.badge));
    card.append(el('h3', '', item.title));
    card.append(el('p', '', item.description));
    card.append(el('div', 'price', item.price));
    cards.append(card);
  });
  featured.append(cards);
  wrap.append(featured);
  return wrap;
}

function buildPlaceholderPanel(title, copy) {
  const section = el('section', 'placeholder-block');
  section.append(el('h3', '', title));
  section.append(el('p', '', copy));
  return section;
}

function render(root) {
  const site = el('main', 'site');
  const shell = el('div', 'shell');

  const header = el('header', 'header');
  header.append(el('h1', '', appData.brand));
  header.append(el('p', '', appData.tagline));

  const tabList = el('div', 'tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Primary sections');

  const panelsWrap = el('section', 'tab-panels');
  const tabs = [];
  const panels = [];

  appData.tabs.forEach((tabData, index) => {
    const tab = el('button', 'tab', tabData.label);
    tab.setAttribute('role', 'tab');
    tab.id = `tab-${tabData.id}`;
    tab.dataset.tabTarget = tabData.id;
    tab.setAttribute('aria-controls', `panel-${tabData.id}`);
    tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    tab.setAttribute('tabindex', index === 0 ? '0' : '-1');
    tab.addEventListener('click', () => activateTab(tabData.id, tabs, panels));

    const panel = el('article', `panel ${index === 0 ? 'active' : ''}`);
    panel.setAttribute('role', 'tabpanel');
    panel.id = `panel-${tabData.id}`;
    panel.setAttribute('aria-labelledby', tab.id);
    panel.hidden = index !== 0;

    if (tabData.id === 'overview') {
      panel.append(buildOverviewPanel());
    } else if (tabData.id === 'menu') {
      panel.append(buildPlaceholderPanel('Menu tab placeholder', 'Use this tab for category-level browsing, weekly menu rotations, and filters sourced from files in /data.'));
    } else {
      panel.append(buildPlaceholderPanel('Contact tab placeholder', 'Use this tab for business contact details, inquiry forms, catering requests, and map/location details.'));
    }

    tabs.push(tab);
    panels.push(panel);
    tabList.append(tab);
    panelsWrap.append(panel);
  });

  shell.append(header, tabList, panelsWrap);
  site.append(shell);
  root.innerHTML = '';
  root.append(site);
}

window.webframe = {
  version: '2.1.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
