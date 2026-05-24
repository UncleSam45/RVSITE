async function loadAppData() {
  return fetch('./data/items.json').then((r) => r.json());
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function render(root, appData) {
  const wrap = el('div', 'site');
  const brand = el('h1', '', appData.brand);
  const tagline = el('p', '', appData.tagline);

  const tabs = el('div', 'tabs');
  appData.tabs.forEach((t) => tabs.append(el('button', 'tab', t.label)));

  const cats = el('div', 'cats');
  appData.categories.forEach((c) => cats.append(el('span', 'cat', c)));

  const items = el('div', 'items');
  appData.items.forEach((item) => {
    const card = el('article', 'item');
    card.append(el('h3', '', item.title));
    card.append(el('p', '', item.description));
    card.append(el('p', '', `$${item.price}`));
    items.append(card);
  });

  wrap.append(brand, tagline, tabs, cats, items);
  root.innerHTML = '';
  root.append(wrap);
}

window.webframe = {
  version: '1.2.0',
  async init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    const appData = await loadAppData();
    render(root, appData);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
