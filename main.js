const appData = {
  brand: 'Harvest & Hearth',
  tagline: 'Local Cooking Studio & Weekly Meal Craft',
  tabs: [
    {
      id: 'overview',
      label: 'Overview',
      title: 'Seasonal meals crafted for your week.',
      description:
        'Placeholder content for your main landing message. This tab can later include calls to action, promotions, and trust indicators.',
    },
    {
      id: 'menu',
      label: 'Menu',
      title: 'Browse categories and featured items.',
      description:
        'Placeholder menu content. You can connect this section to dynamic data from your backend or a JSON file in /data.',
    },
    {
      id: 'contact',
      label: 'Contact',
      title: 'Get in touch for catering and private events.',
      description:
        'Placeholder contact content. Add your forms, map, hours, and social channels here.',
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
      width: min(1200px, 100% - 2rem);
      margin: 1.5rem auto;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(9, 14, 23, 0.75);
      box-shadow: var(--shadow);
    }
    .header h1 { margin: 0; font-size: clamp(1.6rem, 2.5vw, 2.4rem); }
    .header p { margin: 0.35rem 0 1.2rem; color: var(--muted); }

    .tabs {
      display: flex;
      gap: 0.6rem;
      border-bottom: 1px solid var(--line);
      padding-bottom: 0.8rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .tab {
      appearance: none;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      padding: 0.55rem 0.9rem;
      border-radius: 999px;
      font-size: 0.95rem;
      cursor: pointer;
      transition: 180ms ease;
    }
    .tab:hover,
    .tab[aria-selected='true'] {
      color: var(--text);
      border-color: var(--line);
      background: rgba(255,255,255,0.06);
    }

    .tab-panels {
      display: grid;
      gap: 0.9rem;
    }
    .panel {
      display: none;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      padding: 1rem;
    }
    .panel.active {
      display: block;
    }
    .panel h2 {
      margin: 0 0 0.5rem;
      font-size: 1.2rem;
    }
    .panel p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      max-width: 75ch;
    }
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

function render(root) {
  const site = el('main', 'site');

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
    panel.append(el('h2', '', tabData.title));
    panel.append(el('p', '', tabData.description));

    tabs.push(tab);
    panels.push(panel);
    tabList.append(tab);
    panelsWrap.append(panel);
  });

  site.append(header, tabList, panelsWrap);
  root.innerHTML = '';
  root.append(site);
}

window.webframe = {
  version: '2.0.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
