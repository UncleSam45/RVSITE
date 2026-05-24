const appData = {
  brand: 'Harvest & Hearth',
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
      background: transparent;
      cursor: pointer;
    }
    .tab:hover,
    .tab[aria-selected="true"] {
      color: var(--text);
      border-color: var(--line);
      background: rgba(255,255,255,0.06);
    }
    .tab.icon-tab {
      padding: 0.45rem 0.6rem;
      font-size: 1rem;
      line-height: 1;
    }
    .tab-panel {
      margin-top: 1.1rem;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: linear-gradient(160deg, rgba(245,185,112,.12), rgba(243,139,117,.14) 48%, rgba(255,255,255,.02));
      box-shadow: var(--shadow);
      min-height: 360px;
      padding: 2rem;
      display: grid;
      align-content: center;
      justify-items: center;
      text-align: center;
      gap: 0.8rem;
    }
    .tab-panel[hidden] { display: none; }
    .panel-title {
      margin: 0;
      font-size: clamp(1.6rem, 2.6vw, 2.6rem);
    }
    .panel-subtitle {
      margin: 0;
      color: var(--muted);
      max-width: 55ch;
    }
    .placeholder {
      width: min(900px, 100%);
      min-height: 180px;
      border: 1px dashed var(--line);
      border-radius: 16px;
      background: var(--panel);
    }
    @media (max-width: 900px) {
      .topbar { flex-direction: column; align-items: stretch; }
      .nav { justify-content: center; }
      .tab-panel { min-height: 300px; padding: 1.25rem; }
    }
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

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabId;
    });
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

function render(root) {
  const site = el('div', 'site');

  const topbarWrap = el('div', 'container');
  const topbar = el('header', 'topbar');
  topbar.append(el('div', 'brand', appData.brand));

  const nav = el('div', 'nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Sections principales');

  const tabButtons = appData.tabs.map((tab, idx) => {
    const button = el('button', 'tab', tab.label);
    button.type = 'button';
    button.id = `tab-${tab.id}`;
    button.dataset.tabId = tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `panel-${tab.id}`);
    button.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    button.tabIndex = idx === 0 ? 0 : -1;
    nav.append(button);
    return button;
  });

  appData.iconNav.forEach((item) => {
    const iconTab = el('button', 'tab icon-tab', item.icon);
    iconTab.type = 'button';
    iconTab.setAttribute('aria-label', item.label);
    iconTab.title = item.label;
    nav.append(iconTab);
  });

  topbar.append(nav);
  topbarWrap.append(topbar);

  const panelWrap = el('div', 'container');
  const panels = appData.tabs.map((tab, idx) => {
    const panel = el('section', 'tab-panel');
    panel.id = `panel-${tab.id}`;
    panel.dataset.tabPanel = tab.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.hidden = idx !== 0;

    panel.append(el('h2', 'panel-title', tab.label));
    panel.append(el('p', 'panel-subtitle', 'Section prête: espace réservé pour votre contenu.'));
    panel.append(el('div', 'placeholder'));

    panelWrap.append(panel);
    return panel;
  });

  site.append(topbarWrap, panelWrap);
  root.innerHTML = '';
  root.append(site);

  setupTabs(tabButtons, panels);
}

window.webframe = {
  version: '1.1.0',
  init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
