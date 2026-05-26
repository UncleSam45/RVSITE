const appData = {
  brand: 'LA CUISINE DE ROSALIE',
  tagline: 'Repas faits maison • Livraison locale',
  tabs: [
    { id: 'home', label: 'ACCUEIL' },
    { id: 'menu', label: 'MENUS' },
    { id: 'calendar', label: 'CALENDRIER' },
    { id: 'special', label: 'SPÉCIAUX DU JOUR' },
    { id: 'contact', label: 'CONTACT' },
  ],
  iconNav: [
    { icon: '🛒', label: 'Panier', action: 'cart' },
  ],
  categories: ['All'],
  highlights: [],
  archives: [],
  items: [],
  currentMenu: null,
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
const calendarState = {
  selectedDate: '',
  plannedByDate: {},
};

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

function addToCart(item, option, deliveryDate = '') {
  const existing = cartState.entries.find((entry) => entry.itemId === item.id && entry.optionKey === option.key && (entry.deliveryDate || '') === deliveryDate);
  if (existing) existing.qty += 1;
  else cartState.entries.push({
    itemId: item.id,
    optionKey: option.key,
    title: item.title || 'Item',
    optionLabel: option.label,
    price: Number.isFinite(option.price) ? option.price : null,
    priceText: Number.isFinite(option.price) ? formatCurrency(option.price) : option.priceText || '',
    deliveryDate,
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
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      currentMenu: payload?.current_menu && typeof payload.current_menu === 'object' ? payload.current_menu : null,
    };
  } catch (error) {
    console.warn('[webframe] Could not load items.json, using empty list.', error);
    return { items: [], currentMenu: null };
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
  appData.archives = availableItems.filter((item) => !isFeatured(item));
}

function syncCurrentMenu(meta) {
  appData.currentMenu = meta || null;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
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
    .cards.carousel { grid-auto-flow: column; grid-auto-columns: minmax(260px, 320px); grid-template-columns: none; overflow-x: auto; padding-bottom: .4rem; scroll-snap-type: x mandatory; }
    .cards.carousel .card { scroll-snap-align: start; }
    .menu-period { border: 1px solid #dfd1bd; border-radius: 16px; background: linear-gradient(135deg, #fff6e8, #fff); padding: 1rem; display: grid; gap: .45rem; margin-bottom: 1rem; }
    .menu-period h3 { margin: 0; font-size: 1.2rem; }
    .menu-period .dates { font-weight: 700; color: #6e4b24; margin: 0; }
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
    .calendar-layout { display: grid; gap: 1rem; grid-template-columns: minmax(340px, 1.2fr) minmax(300px, 1fr); align-items: start; }
    .calendar-card, .planner-card { background: #fff; border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); padding: 1rem; }
    .calendar-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: .7rem; }
    .month-label { font-weight: 700; font-size: 1.02rem; }
    .month-btn { border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: .32rem .55rem; cursor: pointer; font-weight: 700; }
    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: .35rem; }
    .weekday { text-align: center; font-size: .78rem; color: var(--muted); font-weight: 700; padding-bottom: .2rem; }
    .day-btn { border: 1px solid #e9e0d4; background: #fff; border-radius: 10px; min-height: 52px; cursor: pointer; font-weight: 600; }
    .day-btn:hover { border-color: #d7b894; }
    .day-btn.selected { background: #f4ede5; border-color: #b88442; color: #6e4b24; }
    .day-btn.faded { opacity: .45; }
    .planner-list { display: grid; gap: .55rem; margin-top: .7rem; }
    .planner-row { border: 1px solid #ebe3d8; border-radius: 12px; padding: .7rem; display: grid; gap: .45rem; background: #fcfaf7; }
    .planner-title { font-weight: 700; }
    .planner-actions { display: flex; gap: .55rem; }
    .planner-date-items { margin-top: .45rem; display: grid; gap: .35rem; }
    .planner-date-item { font-size: .86rem; color: #3b3024; background: #f7efe5; border: 1px solid #eadbc9; border-radius: 8px; padding: .32rem .45rem; display: flex; justify-content: space-between; gap: .5rem; align-items: center; }
    .planner-remove { border: 0; background: transparent; color: #8b5e29; font-weight: 700; cursor: pointer; }
    .planner-summary { margin-top: .8rem; border-top: 1px dashed #d9cfc4; padding-top: .7rem; color: var(--muted); font-size: .92rem; display: grid; gap: .55rem; }
    .summary-date { font-weight: 700; color: #2f2418; }
    .summary-list { margin: 0; padding-left: 1rem; display: grid; gap: .3rem; }
    .summary-item { color: #4a3d2f; }
    .summary-empty { margin: 0; }
    @media (max-width: 980px) { .calendar-layout { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .topbar { flex-wrap: wrap; } .brand-wrap, .nav { width: 100%; justify-content: center; } .brand-title { object-position: center; } }
  `;
  document.head.appendChild(style);
}

function formatDateIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarPanel(panel) {
  const section = el('section', 'section');
  section.append(el('h2', '', 'Planifiez vos commandes à l’avance'));
  const layout = el('div', 'calendar-layout');
  const calendarCard = el('div', 'calendar-card');
  const plannerCard = el('div', 'planner-card');

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  calendarState.selectedDate = calendarState.selectedDate || formatDateIso(today);

  const toolbar = el('div', 'calendar-toolbar');
  const prev = el('button', 'month-btn', '←');
  const next = el('button', 'month-btn', '→');
  prev.type = 'button'; next.type = 'button';
  const monthLabel = el('div', 'month-label');
  toolbar.append(prev, monthLabel, next);
  const grid = el('div', 'calendar-grid');
  calendarCard.append(toolbar, grid);

  const plannerTitle = el('h3', 'cart-title', 'Menu du jour sélectionné');
  const plannerHint = el('p', 'cart-hint');
  const plannerList = el('div', 'planner-list');
  const checkoutBtn = el('button', 'hero-cta', 'Passer à la caisse');
  checkoutBtn.type = 'button';
  const plannerSummary = el('div', 'planner-summary');
  plannerCard.append(plannerTitle, plannerHint, plannerList, checkoutBtn, plannerSummary);

  function updatePlanner() {
    const dateLabel = calendarState.selectedDate || 'Aucune date';
    plannerHint.textContent = `Date: ${dateLabel}`;
    plannerList.innerHTML = '';
    const optionsByItem = calendarState.plannedByDate[calendarState.selectedDate] || {};
    appData.highlights.forEach((item) => {
      const options = getPortionOptions(item);
      if (!options.length) return;
      const row = el('div', 'planner-row');
      row.append(el('div', 'planner-title', item.title || 'Item'));
      const actions = el('div', 'planner-actions');
      const select = el('select', 'portion-select');
      options.forEach((opt) => {
        const optionNode = document.createElement('option');
        optionNode.value = opt.key;
        optionNode.textContent = `${opt.label}${opt.price != null ? ` • ${formatCurrency(opt.price)}` : ''}`;
        select.append(optionNode);
      });
      if (optionsByItem[item.id]) select.value = optionsByItem[item.id];
      select.addEventListener('change', () => {
        if (!calendarState.plannedByDate[calendarState.selectedDate]) calendarState.plannedByDate[calendarState.selectedDate] = {};
        calendarState.plannedByDate[calendarState.selectedDate][item.id] = select.value;
        updatePlannerSummary();
      });
      const addForDateBtn = el('button', 'add-btn', 'Ajouter à cette date');
      addForDateBtn.type = 'button';
      addForDateBtn.addEventListener('click', () => {
        if (!calendarState.plannedByDate[calendarState.selectedDate]) calendarState.plannedByDate[calendarState.selectedDate] = {};
        calendarState.plannedByDate[calendarState.selectedDate][item.id] = select.value;
        addForDateBtn.classList.add('added');
        addForDateBtn.textContent = 'Ajouté ✓';
        window.setTimeout(() => {
          addForDateBtn.classList.remove('added');
          addForDateBtn.textContent = 'Ajouter à cette date';
        }, 900);
        updatePlanner();
      });
      actions.append(select, addForDateBtn);
      row.append(actions);
      const dateItems = el('div', 'planner-date-items');
      if (optionsByItem[item.id]) {
        const chosenOption = options.find((option) => option.key === optionsByItem[item.id]);
        const tag = chosenOption?.price != null ? formatCurrency(chosenOption.price) : chosenOption?.priceText || '';
        const selectedChip = el('div', 'planner-date-item');
        const label = `${chosenOption?.label || optionsByItem[item.id]}${tag ? ` • ${tag}` : ''}`;
        selectedChip.append(el('span', '', `Prévu: ${label}`));
        const removeBtn = el('button', 'planner-remove', 'Retirer');
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => {
          delete calendarState.plannedByDate[calendarState.selectedDate][item.id];
          if (Object.keys(calendarState.plannedByDate[calendarState.selectedDate]).length === 0) {
            delete calendarState.plannedByDate[calendarState.selectedDate];
          }
          updatePlanner();
        });
        selectedChip.append(removeBtn);
        dateItems.append(selectedChip);
      }
      row.append(dateItems);
      plannerList.append(row);
    });
    updatePlannerSummary();
  }

  function updatePlannerSummary() {
    const dateKeys = Object.keys(calendarState.plannedByDate).filter((dateKey) => Object.keys(calendarState.plannedByDate[dateKey] || {}).length > 0);
    plannerSummary.innerHTML = '';
    if (dateKeys.length === 0) {
      plannerSummary.append(el('p', 'summary-empty', 'Sélectionnez des options pour remplir votre calendrier.'));
      return;
    }
    dateKeys.sort();
    dateKeys.forEach((dateKey) => {
      const block = el('div');
      block.append(el('div', 'summary-date', dateKey));
      const list = el('ul', 'summary-list');
      Object.entries(calendarState.plannedByDate[dateKey] || {}).forEach(([itemId, optionKey]) => {
        const item = appData.highlights.find((entry) => entry.id === itemId);
        if (!item) return;
        const option = getPortionOptions(item).find((entry) => entry.key === optionKey);
        const label = option?.label || optionKey;
        const tag = option?.price != null ? ` • ${formatCurrency(option.price)}` : option?.priceText ? ` • ${option.priceText}` : '';
        const li = el('li', 'summary-item', `${item.title} (${label}${tag})`);
        const remove = el('button', 'planner-remove', 'Retirer');
        remove.type = 'button';
        remove.addEventListener('click', () => {
          delete calendarState.plannedByDate[dateKey][itemId];
          if (Object.keys(calendarState.plannedByDate[dateKey]).length === 0) delete calendarState.plannedByDate[dateKey];
          updatePlanner();
        });
        li.append(' ', remove);
        list.append(li);
      });
      block.append(list);
      plannerSummary.append(block);
    });
  }

  function renderCalendar() {
    grid.innerHTML = '';
    monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((day) => grid.append(el('div', 'weekday', day)));
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startShift = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(viewYear, viewMonth, 1 - startShift);
    for (let idx = 0; idx < 42; idx += 1) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + idx);
      const iso = formatDateIso(current);
      const button = el('button', 'day-btn', String(current.getDate()));
      button.type = 'button';
      if (current.getMonth() !== viewMonth) button.classList.add('faded');
      if (iso === calendarState.selectedDate) button.classList.add('selected');
      button.addEventListener('click', () => {
        calendarState.selectedDate = iso;
        renderCalendar();
        updatePlanner();
      });
      grid.append(button);
    }
  }

  prev.addEventListener('click', () => { viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } renderCalendar(); });
  next.addEventListener('click', () => { viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderCalendar(); });
  checkoutBtn.addEventListener('click', () => {
    const dates = Object.keys(calendarState.plannedByDate);
    let added = 0;
    dates.forEach((dateKey) => {
      const daySelections = calendarState.plannedByDate[dateKey] || {};
      Object.entries(daySelections).forEach(([itemId, optionKey]) => {
        const item = appData.highlights.find((entry) => entry.id === itemId);
        if (!item) return;
        const option = getPortionOptions(item).find((entry) => entry.key === optionKey);
        if (!option) return;
        addToCart(item, option, dateKey);
        added += 1;
      });
    });
    if (added > 0) {
      checkoutBtn.textContent = `Ajouté au panier (${added}) ✓`;
      window.setTimeout(() => { checkoutBtn.textContent = 'Passer à la caisse'; }, 1300);
    }
  });

  renderCalendar();
  updatePlanner();
  layout.append(calendarCard, plannerCard);
  section.append(layout);
  panel.append(section);
}

function setupTabs(tabButtons, panels) { const activateTab = (tabId) => { tabButtons.forEach((button) => { const isActive = button.dataset.tabId === tabId; button.setAttribute('aria-selected', String(isActive)); button.tabIndex = isActive ? 0 : -1; }); panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== tabId; }); }; tabButtons.forEach((button) => { button.addEventListener('click', () => activateTab(button.dataset.tabId)); }); activateTab(tabButtons[0]?.dataset.tabId); return activateTab; }

function buildMenuCards(target, items, options = {}) {
  const cards = el('div', `cards${options.carousel ? ' carousel' : ''}`);
  items.forEach((item) => {
    const card = el('article', 'card');
    const image = el('img', 'card-media');
    image.src = item.image || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80';
    image.alt = item.title || "Image d'un item du menu";
    image.loading = 'lazy';
    const content = el('div', 'card-content');
    if (!isFeatured(item)) content.append(el('div', 'badge', 'En rotation'));
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
        left.append(el('div', 'cart-meta', `Qty: ${entry.qty}${entry.deliveryDate ? ` • Date: ${entry.deliveryDate}` : ''}`));
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

  const featuredSection = el('section', 'section');
  featuredSection.append(el('h2', '', 'Plats vedettes du menu en cours'));
  featuredSection.append(el('p', 'lead', 'Ces plats sont disponibles maintenant pendant la période active du menu.'));
  if (appData.highlights.length > 0) buildMenuCards(featuredSection, appData.highlights, { carousel: true });
  else featuredSection.append(el('p', 'empty-state', 'Aucun item en vedette pour le moment.'));

  const cert = el('div', 'cert-block');
  const certLogo = el('img', 'cert-logo');
  certLogo.src = 'https://www.hygiene-et-salubrite-alimentaires.com/wp-content/uploads/2018/05/Formation-mapaq.png';
  certLogo.alt = 'Logo de certification MAPAQ';
  certLogo.loading = 'lazy';
  cert.append(certLogo);
  cert.append(el('p', 'cert-text', "Certification MAPAQ: formation obligatoire en hygiène et salubrité alimentaires délivrée par le ministère de l'Agriculture, des Pêcheries et de l'Alimentation du Québec afin de prévenir les risques d'intoxication alimentaire."));

  panel.append(featuredSection, cert);
}


function buildCartPanel(panel) {
  const wrap = el('section', 'section');
  wrap.append(el('h2', '', 'Panier'));
  buildCartSection(wrap, 'Cart Summary');
  panel.append(wrap);
}

function buildMenuPanel(panel) {
  const menuSection = el('section', 'section');
  menuSection.append(el('h2', '', 'Menu de la période'));
  const periodCard = el('div', 'menu-period');
  periodCard.append(el('h3', '', appData.currentMenu?.title || 'Menu en cours'));
  const start = formatDisplayDate(appData.currentMenu?.start_date);
  const end = formatDisplayDate(appData.currentMenu?.end_date);
  periodCard.append(el('p', 'dates', start && end ? `Du ${start} au ${end}` : 'Période à confirmer'));
  periodCard.append(el('p', '', appData.currentMenu?.description || 'Les plats marqués en vedette sont offerts maintenant.'));
  menuSection.append(periodCard);
  menuSection.append(el('h2', '', 'Disponibles maintenant'));
  if (appData.highlights.length > 0) buildMenuCards(menuSection, appData.highlights);
  else menuSection.append(el('p', 'empty-state', 'Aucun plat vedette disponible pour cette période.'));
  menuSection.append(el('h2', '', 'Autres plats du roulement'));
  menuSection.append(el('p', 'lead', 'Ces plats ne sont pas offerts en ce moment, mais reviennent dans nos menus tournants.'));
  if (appData.archives.length > 0) buildMenuCards(menuSection, appData.archives);
  else menuSection.append(el('p', 'empty-state', 'Tous les plats sont actuellement en vedette.'));
  panel.append(menuSection);
}
function buildContactPanel(panel) { const empty = el('div', 'empty-panel'); empty.append(el('h2', 'panel-title', 'Contactez-nous')); empty.append(el('p', 'panel-subtitle', 'Nous couvrons les secteurs suivants au Québec : Contrecoeur, Sorel, Varennes, Saint-Roch-de-Richelieu et Verchères.')); const phone = el('p', 'panel-subtitle', 'Téléphone : 514-298-7545'); const details = el('p', 'panel-subtitle', 'Repas faits maison certifiés MAPAQ. Commandes au moins 48h à l\'avance. Minimum de commande : 30💲. Livraison gratuite 💛.'); const certExplain = el('p', 'panel-subtitle', "Une certification MAPAQ est une formation obligatoire en hygiène et salubrité alimentaires délivrée par le ministère de l'Agriculture, des Pêcheries et de l'Alimentation du Québec pour prévenir les risques d'intoxication alimentaire."); const certLogo = el('img', 'cert-logo'); certLogo.src = 'https://www.hygiene-et-salubrite-alimentaires.com/wp-content/uploads/2018/05/Formation-mapaq.png'; certLogo.alt = 'Logo officiel de formation MAPAQ'; certLogo.loading = 'lazy'; empty.append(phone, details, certExplain, certLogo); panel.append(empty); }

function buildSpecialPanel(panel) { const empty = el('div', 'empty-panel'); empty.append(el('h2', 'panel-title', 'SPÉCIAUX DU JOUR')); empty.append(el('p', 'panel-subtitle', 'Service traiteur pour événements privés, corporatifs et familiaux. Contactez-nous pour planifier votre menu.')); panel.append(empty); }

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
    if (tab.id === 'home') buildHomePanel(panel); else if (tab.id === 'menu') buildMenuPanel(panel); else if (tab.id === 'calendar') buildCalendarPanel(panel); else if (tab.id === 'contact') buildContactPanel(panel); else if (tab.id === 'special') buildSpecialPanel(panel); else if (tab.id === 'cart') buildCartPanel(panel);
    panelWrap.append(panel);
    return panel;
  });


  // Safety: cart UI must exist only in the dedicated cart tab.
  panels.forEach((panel) => {
    if (panel.dataset.tabPanel !== 'cart') {
      panel.querySelectorAll('.cart-panel').forEach((node) => node.remove());
    }
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
    const payload = await loadItems();
    syncDataFromItems(payload.items);
    syncCurrentMenu(payload.currentMenu);
    injectStyles();
    render(root);
  },
};

window.addEventListener('DOMContentLoaded', () => window.webframe?.init());
