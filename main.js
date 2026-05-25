const appData = {
  brand: 'LA CUISINE DE ROSALIE',
  tagline: 'Repas faits maison • Livraison locale',
  tabs: [
    { id: 'home', label: 'ACCUEIL' },
    { id: 'menu', label: 'MENU' },
    { id: 'special', label: 'ÉVÉNEMENTS' },
    { id: 'contact', label: 'CONTACT' },
  ],
  iconNav: [
    { icon: '🛒', label: 'Panier', action: 'cart' },
  ],
  categories: ['All'],
  highlights: [],
  items: [],
};

const cartState = {
  entries: [],
  customer: {
    name: '',
    phone: '',
    streetNumber: '',
    streetName: '',
    apartment: '',
    city: '',
    province: '',
    postalCode: '',
  },
  listeners: new Set(),
};
const CART_STORAGE_KEY = 'lacuisine_cart_v1';

function formatCurrency(value) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '';
}

function getPortionOptions(item) {
  const pricing = item?.pricing || {};
  const options = [];
  if (pricing.small_meal != null) options.push({ key: 'small_meal', label: 'Small', price: Number(pricing.small_meal) });
  if (pricing.large_meal != null) options.push({ key: 'large_meal', label: 'Large', price: Number(pricing.large_meal) });
  if (pricing.family_format != null) options.push({ key: 'family_format', label: 'Family', priceText: `${pricing.family_format}` });
  return options;
}

function getCartTotals() {
  const subtotal = cartState.entries.reduce((sum, entry) => sum + (entry.price || 0) * entry.qty, 0);
  const itemCount = cartState.entries.reduce((sum, entry) => sum + entry.qty, 0);
  return { subtotal, itemCount };
}

function subscribeCart(listener) {
  cartState.listeners.add(listener);
  listener();
  return () => cartState.listeners.delete(listener);
}

function notifyCart() {
  cartState.listeners.forEach((listener) => listener());
}

function saveCartToStorage() {
  try {
    const payload = {
      entries: cartState.entries,
      customer: cartState.customer,
    };
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[webframe] Could not save cart to localStorage.', error);
  }
}

function loadCartFromStorage() {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.entries)) {
      cartState.entries = parsed.entries
        .map((entry) => ({
          ...entry,
          qty: Math.max(1, Number(entry.qty) || 1),
          price: Number.isFinite(entry.price) ? entry.price : null,
        }))
        .filter((entry) => entry.itemId && entry.optionKey);
    }
    if (parsed?.customer && typeof parsed.customer === 'object') {
      cartState.customer.name = typeof parsed.customer.name === 'string' ? parsed.customer.name : '';
      cartState.customer.phone = typeof parsed.customer.phone === 'string' ? parsed.customer.phone : '';
      cartState.customer.streetNumber = typeof parsed.customer.streetNumber === 'string' ? parsed.customer.streetNumber : '';
      cartState.customer.streetName = typeof parsed.customer.streetName === 'string' ? parsed.customer.streetName : '';
      cartState.customer.apartment = typeof parsed.customer.apartment === 'string' ? parsed.customer.apartment : '';
      cartState.customer.city = typeof parsed.customer.city === 'string' ? parsed.customer.city : '';
      cartState.customer.province = typeof parsed.customer.province === 'string' ? parsed.customer.province : '';
      cartState.customer.postalCode = typeof parsed.customer.postalCode === 'string' ? parsed.customer.postalCode : '';
      if ((!cartState.customer.streetName || !cartState.customer.city) && typeof parsed.customer.address === 'string') {
        cartState.customer.streetName = parsed.customer.address;
      }
    }
  } catch (error) {
    console.warn('[webframe] Could not load cart from localStorage.', error);
  }
}

function addToCart(item, option) {
  const existing = cartState.entries.find((entry) => entry.itemId === item.id && entry.optionKey === option.key);
  if (existing) existing.qty += 1;
  else cartState.entries.push({
    itemId: item.id,
    optionKey: option.key,
    title: item.title || 'Item',
    optionLabel: option.label,
    price: Number.isFinite(option.price) ? option.price : null,
    priceText: Number.isFinite(option.price) ? formatCurrency(option.price) : option.priceText || '',
    qty: 1,
  });
  saveCartToStorage();
  notifyCart();
}

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
    .card-actions { display: flex; gap: .55rem; align-items: center; margin-top: .2rem; }
    .portion-select { flex: 1; border: 1px solid var(--line); border-radius: 10px; padding: .5rem .55rem; background: #fff; color: #34291e; }
    .add-btn { border: 0; border-radius: 10px; padding: .55rem .85rem; color: #fff; font-weight: 700; cursor: pointer; background: linear-gradient(180deg, #ba8447, #9e6d35); }
    .add-btn:hover { filter: brightness(1.06); }
    .add-btn.added { background: linear-gradient(180deg, #4d8b69, #35664d); }
    .cart-panel { margin-top: 1.25rem; border: 1px solid var(--line); background: #fff; border-radius: 18px; padding: 1rem; box-shadow: var(--shadow); }
    .cart-title { margin: 0 0 .35rem; font-size: 1.1rem; }
    .cart-hint { margin: 0; color: var(--muted); font-size: .92rem; }
    .cart-items { margin-top: .8rem; display: grid; gap: .55rem; }
    .cart-row { border: 1px solid #ebe3d8; border-radius: 12px; padding: .6rem .7rem; background: #fcfaf7; display: flex; justify-content: space-between; gap: .6rem; }
    .cart-name { font-weight: 600; }
    .cart-meta { font-size: .88rem; color: var(--muted); }
    .cart-total { margin-top: .9rem; padding-top: .7rem; border-top: 1px dashed #d9cfc4; display: flex; justify-content: space-between; font-weight: 700; }
    .customer-section { margin-top: .9rem; padding-top: .9rem; border-top: 1px dashed #d9cfc4; display: grid; gap: .8rem; }
    .customer-title { margin: 0; font-size: .97rem; font-weight: 700; color: #2f2418; }
    .customer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; align-items: end; }
    .customer-label { font-size: .85rem; color: var(--muted); font-weight: 600; display: grid; gap: .3rem; }
    .customer-label.full { grid-column: 1 / -1; }
    .customer-input { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: .55rem .65rem; font: inherit; background: #fff; min-height: 40px; }
    .customer-input:focus { outline: 2px solid #d6b084; border-color: #d6b084; }
    @media (max-width: 620px) { .customer-grid { grid-template-columns: 1fr; } }
    .empty-state { color: var(--muted); border: 1px dashed #d3c7b9; border-radius: 12px; padding: 1rem; background: #fcfaf7; }
    .empty-panel { border-radius: 22px; border: 1px solid var(--line); min-height: 320px; padding: 2rem; display: grid; place-items: center; text-align: center; gap: .6rem; background: #fff; box-shadow: var(--shadow); }
    .panel-title { margin: 0; font-size: clamp(1.4rem, 3vw, 2.4rem); }
    .panel-subtitle { margin: 0; color: var(--muted); }
    .placeholder { width: min(820px, 100%); min-height: 150px; border: 1px dashed #d8cec2; border-radius: 14px; }
    .cert-block { margin-top: 1.2rem; border: 1px solid var(--line); background: #fff; border-radius: 16px; padding: 1rem; display: grid; gap: .7rem; align-items: center; }
    .cert-logo { width: min(260px, 100%); height: auto; justify-self: start; }
    .cert-text { margin: 0; color: var(--muted); line-height: 1.45; }
    .footer { margin-top: 2rem; border: 1px solid var(--line); border-radius: 20px; background: rgba(255,255,255,0.9); box-shadow: var(--shadow); padding: 1.1rem; display: grid; gap: .8rem; }
    .footer-links { display: flex; flex-wrap: wrap; gap: .6rem; }
    .footer-link { border: 1px solid #d8cab8; background: #fff; color: #2f2418; border-radius: 999px; padding: .45rem .8rem; font-weight: 600; cursor: pointer; }
    .footer-note { margin: 0; color: var(--muted); font-size: .92rem; }
    @media (max-width: 900px) { .topbar { flex-wrap: wrap; } .brand-wrap, .nav { width: 100%; justify-content: center; } .brand-title { object-position: center; } }
  `;
  document.head.appendChild(style);
}

function setupTabs(tabButtons, panels) { const activateTab = (tabId) => { tabButtons.forEach((button) => { const isActive = button.dataset.tabId === tabId; button.setAttribute('aria-selected', String(isActive)); button.tabIndex = isActive ? 0 : -1; }); panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tabId; }); }; tabButtons.forEach((button) => { button.addEventListener('click', () => activateTab(button.dataset.tabId)); }); activateTab(tabButtons[0]?.dataset.tabId); return activateTab; }

function buildMenuCards(target, items) {
  const cards = el('div', 'cards');
  items.forEach((item) => {
    const card = el('article', 'card');
    const image = el('img', 'card-media');
    image.src = item.image || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80';
    image.alt = item.title || "Image d'un item du menu";
    image.loading = 'lazy';
    const content = el('div', 'card-content');
    content.append(el('div', 'badge', item.category || 'Menu'));
    content.append(el('h3', '', item.title || 'Item sans titre'));
    content.append(el('p', '', item.description || ''));
    content.append(el('div', 'price', normalizePrice(item)));

    const options = getPortionOptions(item);
    if (options.length > 0) {
      const actions = el('div', 'card-actions');
      const select = el('select', 'portion-select');
      options.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.key;
        const tag = Number.isFinite(option.price) ? formatCurrency(option.price) : option.priceText;
        opt.textContent = `${option.label}${tag ? ` • ${tag}` : ''}`;
        select.append(opt);
      });
      const addButton = el('button', 'add-btn', 'ADD TO CART');
      addButton.type = 'button';
      addButton.addEventListener('click', () => {
        const selected = options.find((option) => option.key === select.value) || options[0];
        if (!selected) return;
        addToCart(item, selected);
        addButton.classList.add('added');
        addButton.textContent = 'ADDED ✓';
        window.setTimeout(() => {
          addButton.classList.remove('added');
          addButton.textContent = 'ADD TO CART';
        }, 900);
      });
      actions.append(select, addButton);
      content.append(actions);
    }

    card.append(image, content);
    cards.append(card);
  });
  target.append(cards);
}

function buildCartSection(target, title = 'Your Cart') {
  const panel = el('aside', 'cart-panel');
  panel.append(el('h3', 'cart-title', title));
  panel.append(el('p', 'cart-hint', 'Pick a quantity and add cleanly in one click.'));
  const itemsWrap = el('div', 'cart-items');
  const totals = el('div', 'cart-total');
  const customerSection = el('div', 'customer-section');
  customerSection.append(el('p', 'customer-title', 'Delivery details'));
  const customerGrid = el('div', 'customer-grid');

  const createField = ({ key, label, placeholder, className = '', type = 'text', maxLength }) => {
    const fieldLabel = el('label', `customer-label ${className}`.trim(), label);
    const input = el('input', 'customer-input');
    input.type = type;
    input.placeholder = placeholder;
    input.value = cartState.customer[key] || '';
    if (maxLength) input.maxLength = maxLength;
    input.autocomplete = key === 'name' ? 'name' : key === 'phone' ? 'tel' : key === 'postalCode' ? 'postal-code' : 'street-address';
    input.addEventListener('input', () => {
      const value = key === 'postalCode' ? input.value.toUpperCase() : input.value;
      cartState.customer[key] = value.trimStart();
      if (key === 'postalCode' && input.value !== value) input.value = value;
      saveCartToStorage();
    });
    fieldLabel.append(input);
    return fieldLabel;
  };

  const cityLabel = el('label', 'customer-label', 'City');
  const citySelect = el('select', 'customer-input');
  const cityOptions = ['Contrecoeur', 'Sorel', 'Varennes', 'Saint-Roch-de-Richelieu', 'Verchères'];
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Select a city';
  citySelect.append(placeholderOption);
  cityOptions.forEach((city) => {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    citySelect.append(option);
  });
  citySelect.value = cityOptions.includes(cartState.customer.city) ? cartState.customer.city : '';
  citySelect.addEventListener('change', () => {
    cartState.customer.city = citySelect.value;
    saveCartToStorage();
  });
  cityLabel.append(citySelect);

  customerGrid.append(
    createField({ key: 'name', label: 'Full name', placeholder: 'Enter your full name', className: 'full' }),
    createField({ key: 'phone', label: 'Phone number', placeholder: '(514) 000-0000', type: 'tel', className: 'full' }),
    createField({ key: 'streetNumber', label: 'Street number', placeholder: '123' }),
    createField({ key: 'streetName', label: 'Street name', placeholder: 'Main Street' }),
    createField({ key: 'apartment', label: 'Apartment (optional)', placeholder: 'Unit 4B' }),
    cityLabel,
    createField({ key: 'province', label: 'Province', placeholder: 'QC' }),
    createField({ key: 'postalCode', label: 'Postal code', placeholder: 'H2X 1Y4', maxLength: 7 })
  );
  customerSection.append(customerGrid);

  function renderCart() {
    itemsWrap.innerHTML = '';
    const { subtotal, itemCount } = getCartTotals();
    if (cartState.entries.length === 0) {
      itemsWrap.append(el('p', 'empty-state', 'Your cart is empty. Add meals to start your order.'));
    } else {
      cartState.entries.forEach((entry) => {
        const row = el('div', 'cart-row');
        const left = el('div');
        left.append(el('div', 'cart-name', `${entry.title} (${entry.optionLabel})`));
        left.append(el('div', 'cart-meta', `Qty: ${entry.qty}`));
        row.append(left, el('div', 'cart-name', entry.price != null ? formatCurrency(entry.price * entry.qty) : entry.priceText));
        itemsWrap.append(row);
      });
    }
    totals.innerHTML = '';
    totals.append(el('span', '', `Items: ${itemCount}`));
    totals.append(el('span', '', `Subtotal: ${formatCurrency(subtotal)}`));
  }

  subscribeCart(renderCart);
  panel.append(itemsWrap, totals, customerSection);
  target.append(panel);
}

function buildHomePanel(panel) {
  const hero = el('section', 'hero');
  hero.append(el('div', 'kicker', 'Service local • Qualité certifiée'));
  hero.append(el('h1', '', 'Repas faits maison avec certificat MAPAQ, livrés à votre domicile.'));
  hero.append(el('p', 'lead', '🕒 Commandes requises au moins 48h à l\'avance. Minimum 30💲 par commande et livraison gratuite 💛 dans nos zones desservies.'));
  hero.append(el('button', 'hero-cta', 'Commander maintenant'));
  panel.append(hero);

  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Catégories du menu'));
  const chips = el('div', 'chips');
  appData.categories.forEach((category) => chips.append(el('span', 'chip', category)));
  menuSection.append(chips);

  const featuredSection = el('section', 'section');
  featuredSection.append(el('h2', '', 'Sélections en vedette'));
  if (appData.highlights.length > 0) buildMenuCards(featuredSection, appData.highlights);
  else featuredSection.append(el('p', 'empty-state', 'Aucun item en vedette pour le moment.'));

  const cert = el('div', 'cert-block');
  const certLogo = el('img', 'cert-logo');
  certLogo.src = 'https://www.hygiene-et-salubrite-alimentaires.com/wp-content/uploads/2018/05/Formation-mapaq.png';
  certLogo.alt = 'Logo de certification MAPAQ';
  certLogo.loading = 'lazy';
  cert.append(certLogo);
  cert.append(el('p', 'cert-text', "Certification MAPAQ: formation obligatoire en hygiène et salubrité alimentaires délivrée par le ministère de l'Agriculture, des Pêcheries et de l'Alimentation du Québec afin de prévenir les risques d'intoxication alimentaire."));

  panel.append(menuSection, featuredSection, cert);
}


function buildCartPanel(panel) {
  const wrap = el('section', 'section');
  wrap.append(el('h2', '', 'Panier'));
  buildCartSection(wrap, 'Cart Summary');
  panel.append(wrap);
}

function buildMenuPanel(panel) { const menuSection = el('section', 'section'); menuSection.append(el('h2', '', 'Items disponibles')); if (appData.items.length > 0) buildMenuCards(menuSection, appData.items); else menuSection.append(el('p', 'empty-state', 'Aucun item disponible dans data/items.json pour le moment.')); panel.append(menuSection); buildCartSection(panel); }
function buildContactPanel(panel) { const empty = el('div', 'empty-panel'); empty.append(el('h2', 'panel-title', 'Contactez-nous')); empty.append(el('p', 'panel-subtitle', 'Nous couvrons les secteurs suivants au Québec : Contrecoeur, Sorel, Varennes, Saint-Roch-de-Richelieu et Verchères.')); const phone = el('p', 'panel-subtitle', 'Téléphone : 514-298-7545'); const details = el('p', 'panel-subtitle', 'Repas faits maison certifiés MAPAQ. Commandes au moins 48h à l\'avance. Minimum de commande : 30💲. Livraison gratuite 💛.'); const certExplain = el('p', 'panel-subtitle', "Une certification MAPAQ est une formation obligatoire en hygiène et salubrité alimentaires délivrée par le ministère de l'Agriculture, des Pêcheries et de l'Alimentation du Québec pour prévenir les risques d'intoxication alimentaire."); const certLogo = el('img', 'cert-logo'); certLogo.src = 'https://www.hygiene-et-salubrite-alimentaires.com/wp-content/uploads/2018/05/Formation-mapaq.png'; certLogo.alt = 'Logo officiel de formation MAPAQ'; certLogo.loading = 'lazy'; empty.append(phone, details, certExplain, certLogo); panel.append(empty); }

function buildSpecialPanel(panel) { const empty = el('div', 'empty-panel'); empty.append(el('h2', 'panel-title', 'Événements')); empty.append(el('p', 'panel-subtitle', 'Service traiteur pour événements privés, corporatifs et familiaux. Contactez-nous pour planifier votre menu.')); panel.append(empty); }

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
  appData.iconNav.forEach((item) => {
    const iconTab = el('button', 'tab icon-tab', item.icon);
    iconTab.type = 'button';
    iconTab.setAttribute('aria-label', item.label);
    if (item.action === 'cart') iconTab.dataset.tabId = 'cart';
    nav.append(iconTab);
  });
  topbar.append(nav); topbarWrap.append(topbar);

  const panelWrap = el('div', 'container');
  const panelDefs = [...appData.tabs, { id: 'cart', label: 'Cart' }];
  const panels = panelDefs.map((tab, idx) => {
    const panel = el('section', 'tab-panel');
    panel.dataset.tabPanel = tab.id;
    panel.hidden = idx !== 0;
    if (tab.id === 'home') buildHomePanel(panel); else if (tab.id === 'menu') buildMenuPanel(panel); else if (tab.id === 'contact') buildContactPanel(panel); else if (tab.id === 'special') buildSpecialPanel(panel); else if (tab.id === 'cart') buildCartPanel(panel);
    panelWrap.append(panel);
    return panel;
  });

  const iconTabButtons = Array.from(nav.querySelectorAll('[data-tab-id]')).filter((button) => !tabButtons.includes(button));
  const activateTab = setupTabs([...tabButtons, ...iconTabButtons], panels);

  const footerWrap = el('div', 'container');
  const footer = el('footer', 'footer');
  footer.append(el('p', 'footer-note', 'Raccourcis rapides'));
  const footerLinks = el('div', 'footer-links');
  appData.tabs.forEach((tab) => { const link = el('button', 'footer-link', tab.label); link.type = 'button'; link.addEventListener('click', () => activateTab(tab.id)); footerLinks.append(link); });
  footer.append(footerLinks);
  footer.append(el('p', 'footer-note', 'Entreprise certifiée MAPAQ en hygiène et salubrité alimentaires.'));
  footerWrap.append(footer);

  site.append(topbarWrap, panelWrap, footerWrap);
  root.innerHTML = '';
  root.append(site);
}

window.webframe = {
  version: '1.4.0',
  async init() {
    const root = document.getElementById('webframe-root');
    if (!root) return;
    loadCartFromStorage();
    const items = await loadItems();
    syncDataFromItems(items);
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
