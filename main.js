(() => {
  const DATA_PATHS = {
    settings: 'assets/data/settings.json',
    menus: 'assets/data/menus.json',
    items: 'assets/data/items.json',
    delivery: 'assets/data/delivery.json',
    promotions: 'assets/data/promotions.json',
    content: 'assets/data/content.json',
  };

  const CART_STORAGE_KEY = 'lacuisine_rosalie_cart_v2';
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const WEEKDAY_LABELS = {
    sunday: 'dimanche', monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
    thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi',
  };
  const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };
  const DATE_REASONS = {
    available: 'Disponible', too_soon: 'Commande trop tardive', outside_menu_period: 'Hors menu',
    no_delivery: 'Pas de livraison', full: 'Complet', closed: 'Fermé', invalid: 'Date invalide',
  };

  const state = {
    page: 'home',
    data: null,
    cart: {
      items: [],
      deliveryDate: '',
      customer: {
        name: '', phone: '', email: '', streetNumber: '', streetName: '', apartment: '', city: '', province: 'QC', postalCode: '', notes: '',
      },
    },
    selectedPortions: {},
    quantities: {},
    toastTimer: null,
  };

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap');
      :root{--bg:#F8F3EA;--card:#FFFFFF;--text:#241A12;--muted:#6B6258;--olive:#506B2F;--deep-olive:#2F421E;--gold:#B88442;--brown:#5B351C;--border:#E4D8C8;--success:#3F7456;--warning:#A06320;--error:#A7392D;--shadow:0 18px 45px rgba(36,26,18,.10);--soft:0 8px 22px rgba(36,26,18,.08)}
      *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:radial-gradient(circle at top left,#fffaf1 0,#F8F3EA 36%,#f3eadc 100%);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased} button,input,select,textarea{font:inherit} button{min-height:44px} a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .site{min-height:100vh;padding:12px 12px 92px}.container{width:min(1180px,100%);margin-inline:auto}.topbar{position:sticky;top:10px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border:1px solid rgba(228,216,200,.9);border-radius:24px;background:rgba(255,253,248,.92);backdrop-filter:blur(16px);box-shadow:var(--soft)}.brand{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{display:inline-flex;align-items:center;justify-content:center;width:54px;height:54px;flex:0 0 auto;border-radius:18px;background:linear-gradient(135deg,var(--deep-olive),var(--olive));color:#fff;font-family:'Playfair Display',Georgia,serif;font-size:1.2rem;font-weight:700;box-shadow:0 10px 22px rgba(47,66,30,.18)}.brand-copy{display:block}.brand-name{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.18rem;font-weight:700;line-height:1.05}.brand-tagline{display:block;color:var(--muted);font-size:.82rem;margin-top:3px}.nav{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}.nav-btn{border:1px solid transparent;background:transparent;color:var(--muted);border-radius:999px;padding:9px 12px;font-size:.9rem;font-weight:800;cursor:pointer}.nav-btn:hover,.nav-btn[aria-current=true]{background:#f3eadf;border-color:#dccbb7;color:var(--deep-olive)}.cart-nav{background:var(--deep-olive);color:#fff;border-color:var(--deep-olive)}.cart-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;margin-left:5px;padding:0 6px;border-radius:99px;background:var(--gold);color:#fff;font-size:.78rem}.mobile-menu{display:none;border:1px solid var(--border);border-radius:999px;background:#fff;padding:8px 12px;font-weight:800;color:var(--deep-olive)}
      main{padding-top:18px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:24px;align-items:center;border:1px solid var(--border);border-radius:32px;padding:clamp(22px,4vw,52px);background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(251,245,236,.94));box-shadow:var(--shadow);overflow:hidden}.kicker{color:var(--olive);text-transform:uppercase;letter-spacing:.1em;font-size:.78rem;font-weight:900}.hero h1,.page-title{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2.15rem,5vw,4.65rem);line-height:1.02;margin:10px 0;color:var(--text)}.lead{font-size:clamp(1rem,2vw,1.18rem);line-height:1.75;color:var(--muted);max-width:62ch}.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;border:1px solid transparent;padding:12px 18px;font-weight:900;cursor:pointer;text-decoration:none;transition:transform .15s ease,filter .15s ease}.btn:hover{transform:translateY(-1px);filter:brightness(1.03)}.btn-primary{background:linear-gradient(180deg,#c08d50,#9f682f);color:#fff;box-shadow:0 12px 24px rgba(184,132,66,.24)}.btn-secondary{background:#fff;color:var(--deep-olive);border-color:#d8c8b5}.btn-olive{background:var(--deep-olive);color:#fff}.btn-ghost{background:#fff8ef;color:var(--brown);border-color:#ead9c5}.trust-chips,.chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:#fffdf8;border-radius:999px;padding:8px 11px;color:#5f554b;font-size:.88rem;font-weight:700}.hero-visual{position:relative;min-height:390px;border-radius:28px;overflow:hidden;background:linear-gradient(135deg,#efe1cd,#fff)}.hero-visual img{width:100%;height:100%;min-height:390px;object-fit:cover;display:block}.hero-card{position:absolute;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,255,255,.72);border-radius:22px;padding:16px;background:rgba(255,253,248,.9);backdrop-filter:blur(12px);box-shadow:var(--soft)}.hero-card strong{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.35rem}.section{margin-top:26px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:14px}.section h2{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.7rem,3vw,2.6rem);margin:0}.section p{color:var(--muted);line-height:1.65}.grid{display:grid;gap:16px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}.card,.panel{border:1px solid var(--border);border-radius:24px;background:rgba(255,255,255,.94);box-shadow:var(--soft)}.panel{padding:20px}.mini-card{padding:18px}.mini-card strong{display:block;margin-bottom:6px;color:var(--deep-olive)}.menu-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}.menu-header{border:1px solid #dac6ad;border-radius:28px;padding:24px;background:linear-gradient(135deg,#fff8ef,#fff);box-shadow:var(--soft)}.menu-header h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2rem,4vw,3.4rem);margin:4px 0}.promo{border-left:5px solid var(--gold);background:#fff7eb}.menu-section-title{display:flex;align-items:center;gap:10px;margin:24px 0 12px}.menu-section-title h2{font-size:1.7rem}.menu-card{display:grid;grid-template-columns:160px 1fr;overflow:hidden}.menu-card img{width:100%;height:100%;min-height:210px;object-fit:cover;background:#eee0d2}.menu-card-body{padding:18px;display:grid;gap:12px}.badge{width:fit-content;padding:5px 9px;border-radius:999px;background:#edf2e7;color:var(--deep-olive);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;font-weight:900}.menu-card h3{margin:0;font-size:1.25rem}.menu-card p{margin:0;color:var(--muted);line-height:1.55}.portion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.portion-btn{border:1px solid #d8c8b6;border-radius:16px;background:#fffdf8;padding:10px 8px;cursor:pointer;text-align:center;color:var(--text);font-weight:900}.portion-btn small{display:block;color:var(--muted);font-weight:800;margin-top:2px}.portion-btn.active{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.portion-btn.active small{color:#efe6d9}.item-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.qty{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;overflow:hidden;background:#fff}.qty button{border:0;background:transparent;width:42px;cursor:pointer;font-weight:900;color:var(--deep-olive)}.qty span{min-width:34px;text-align:center;font-weight:900}.unavailable{opacity:.62}.unavailable .btn,.unavailable .portion-btn{pointer-events:none}.cart-panel{position:sticky;top:108px;padding:18px}.cart-panel h2{font-family:'Playfair Display',Georgia,serif;margin:0 0 10px}.cart-empty{padding:14px;border:1px dashed #d8c8b6;border-radius:16px;color:var(--muted);background:#fffaf2}.cart-lines{display:grid;gap:10px}.cart-line{border:1px solid #eadfd2;border-radius:16px;padding:12px;background:#fffdf8}.line-top{display:flex;justify-content:space-between;gap:10px}.line-title{font-weight:900}.line-meta{color:var(--muted);font-size:.86rem;margin-top:2px}.line-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.remove-btn{border:0;background:transparent;color:var(--error);font-weight:900;cursor:pointer}.cart-total,.summary-row{display:flex;justify-content:space-between;gap:12px;padding-top:12px;margin-top:12px;border-top:1px dashed #d7c7b6;font-weight:900}.notice{padding:12px;border-radius:16px;border:1px solid #efd9b8;background:#fff8e9;color:var(--warning);font-weight:800;line-height:1.45}.success-note{border-color:#cfe2d5;background:#f0f8f2;color:var(--success)}.checkout-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}.step{padding:20px}.step h2{display:flex;gap:10px;align-items:center;margin:0 0 12px;font-size:1.3rem}.step-number{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--deep-olive);color:#fff;font-size:.9rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:.88rem;font-weight:900;color:#4b3a2a}.field input,.field select,.field textarea{width:100%;min-height:46px;border:1px solid #d9cab8;border-radius:14px;background:#fffdf8;padding:10px 12px;color:var(--text)}.field textarea{min-height:96px;resize:vertical}.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.date-btn{border:1px solid var(--border);border-radius:16px;background:#fffdf8;padding:10px 4px;cursor:pointer;color:var(--text)}.date-btn strong{display:block}.date-btn span{display:block;font-size:.73rem;color:var(--muted);margin-top:2px}.date-btn.disabled{background:#f0e6d9;color:#8a7b6d;cursor:not-allowed}.date-btn.selected{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.date-btn.selected span{color:#f1e7d8}.quote-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.quote-item{padding:16px;border:1px solid var(--border);border-radius:18px;background:#fffdf8;font-weight:900;color:var(--deep-olive)}.zone-map{min-height:300px;border-radius:28px;background:radial-gradient(circle at 50% 45%,rgba(184,132,66,.45),transparent 24%),radial-gradient(circle at 35% 35%,rgba(80,107,47,.35),transparent 18%),linear-gradient(135deg,#f4e7d6,#fffaf2);display:grid;place-items:center;text-align:center;padding:24px;color:var(--deep-olive);font-weight:900}.footer{margin-top:30px;padding:24px;color:#f8f3ea;background:linear-gradient(135deg,var(--deep-olive),#203015);border-radius:28px}.footer-grid{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:18px}.footer a{color:#fff}.toast{position:fixed;right:18px;bottom:86px;z-index:80;background:var(--deep-olive);color:#fff;border-radius:999px;padding:12px 16px;box-shadow:var(--shadow);font-weight:900;transform:translateY(16px);opacity:0;pointer-events:none;transition:.2s}.toast.show{transform:translateY(0);opacity:1}.mobile-cart-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:75;display:none;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:var(--deep-olive);color:#fff;padding:10px 12px 10px 16px;box-shadow:var(--shadow);font-weight:900}.mobile-cart-bar button{border:0;border-radius:999px;background:var(--gold);color:#fff;padding:9px 14px;font-weight:900;cursor:pointer}
      @media(max-width:980px){.nav{display:none}.mobile-menu{display:inline-flex}.topbar.open .nav{display:flex;position:absolute;left:10px;right:10px;top:76px;padding:12px;border:1px solid var(--border);border-radius:20px;background:#fffdf8;box-shadow:var(--shadow)}.hero,.menu-layout,.checkout-grid{grid-template-columns:1fr}.cart-panel{position:static}.grid-3,.grid-4,.footer-grid{grid-template-columns:1fr 1fr}.mobile-cart-bar{display:flex}.menu-card{grid-template-columns:130px 1fr}.site{padding-bottom:92px}}
      @media(max-width:660px){.site{padding-left:8px;padding-right:8px}.topbar{border-radius:18px}.brand-mark{width:48px;height:48px;border-radius:16px;font-size:1.05rem}.hero{padding:20px;border-radius:24px}.hero-visual,.hero-visual img{min-height:270px}.grid-2,.grid-3,.grid-4,.footer-grid,.form-grid,.quote-list{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.menu-card{grid-template-columns:1fr}.menu-card img{height:210px}.portion-grid{grid-template-columns:1fr}.date-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.checkout-grid{gap:12px}.panel,.step{padding:16px}.brand-name{font-size:1rem}.brand-tagline{font-size:.76rem}}
    `;
    document.head.appendChild(style);
  }

  function setSeo(content) {
    const seo = content?.seo || {};
    document.title = seo.title || 'La cuisine de Rosalie | Repas faits maison & livraison locale';
    upsertMeta('description', seo.description || 'Menus faits maison en rotation, portions Petit / Grand / Familial et livraison locale.');
    upsertMeta('og:title', document.title, 'property');
    upsertMeta('og:description', seo.description || '', 'property');
    upsertMeta('og:type', 'website', 'property');
  }

  function upsertMeta(name, content, attr = 'name') {
    let node = document.querySelector(`meta[${attr}="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attr, name);
      document.head.appendChild(node);
    }
    node.setAttribute('content', content);
  }

  async function fetchJson(path, fallback) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return response.json();
    } catch (error) {
      console.warn('[La cuisine de Rosalie] Données indisponibles:', error);
      return fallback;
    }
  }

  async function loadData() {
    const [settings, menus, items, delivery, promotions, content] = await Promise.all([
      fetchJson(DATA_PATHS.settings, {}), fetchJson(DATA_PATHS.menus, {}), fetchJson(DATA_PATHS.items, { items: [] }),
      fetchJson(DATA_PATHS.delivery, { zones: [], rules: {} }), fetchJson(DATA_PATHS.promotions, { active: [] }), fetchJson(DATA_PATHS.content, {}),
    ]);
    return { settings, menus, items: items.items || [], delivery, promotions, content };
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: state.data?.settings?.ordering?.currency || 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0).replace(/\u00a0/g, ' ');
  }

  function formatDate(dateLike) {
    if (!dateLike) return 'à confirmer';
    const date = typeof dateLike === 'string' ? new Date(`${dateLike}T12:00:00`) : dateLike;
    return new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function getSettingRules() {
    const ordering = state.data?.settings?.ordering || {};
    const deliveryRules = state.data?.delivery?.rules || {};
    return { ...ordering, ...deliveryRules };
  }

  function getEnabledZones() {
    return (state.data?.delivery?.zones || []).filter((zone) => zone.enabled !== false);
  }

  function getCurrentMenu() {
    return state.data?.menus?.current_menu || {};
  }

  function getMenuItems(type = 'items') {
    const menu = getCurrentMenu();
    const ids = type === 'extras' ? menu.extra_ids || [] : menu.item_ids || [];
    const byId = new Map((state.data?.items || []).map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function getPortions(item) {
    return Object.entries(item.pricing || {})
      .filter(([, price]) => price !== null && price !== undefined && price !== '')
      .map(([key, price]) => ({ key, label: PORTION_LABELS[key] || key, price: Number(price) }));
  }

  function getItemById(id) {
    return (state.data?.items || []).find((item) => item.id === id);
  }

  function cartTotals() {
    const subtotal = state.cart.items.reduce((sum, line) => sum + line.price * line.qty, 0);
    const count = state.cart.items.reduce((sum, line) => sum + line.qty, 0);
    return { subtotal, count };
  }

  function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) state.cart.items = parsed.items.filter((line) => line.itemId && line.portion && Number(line.qty) > 0);
      if (typeof parsed.deliveryDate === 'string') state.cart.deliveryDate = parsed.deliveryDate;
      if (parsed.customer && typeof parsed.customer === 'object') state.cart.customer = { ...state.cart.customer, ...parsed.customer };
    } catch (error) {
      console.warn('Panier local illisible.', error);
    }
  }

  function addToCart(item, portionKey, qty = 1) {
    const portion = getPortions(item).find((option) => option.key === portionKey);
    if (!portion || item.available === false) return;
    const existing = state.cart.items.find((line) => line.itemId === item.id && line.portion === portion.key);
    if (existing) existing.qty += qty;
    else state.cart.items.push({ itemId: item.id, title: item.title, portion: portion.key, portionLabel: portion.label, price: portion.price, qty });
    saveCart();
    showToast(`${item.title} ajouté au panier`);
    render();
  }

  function changeLineQty(itemId, portion, delta) {
    const line = state.cart.items.find((entry) => entry.itemId === itemId && entry.portion === portion);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) state.cart.items = state.cart.items.filter((entry) => !(entry.itemId === itemId && entry.portion === portion));
    saveCart();
    render();
  }

  function removeLine(itemId, portion) {
    state.cart.items = state.cart.items.filter((entry) => !(entry.itemId === itemId && entry.portion === portion));
    saveCart();
    render();
  }

  function setPage(page) {
    state.page = page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function isDateAvailable(date) {
    const rules = getSettingRules();
    const menu = getCurrentMenu();
    const noticeHours = Number(rules.order_notice_hours || 48);
    const threshold = new Date(Date.now() + noticeHours * 60 * 60 * 1000);
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    if (normalized < threshold) return { ok: false, reason: 'too_soon' };
    if (menu.start_date && date < new Date(`${menu.start_date}T00:00:00`)) return { ok: false, reason: 'outside_menu_period' };
    if (menu.end_date && date > new Date(`${menu.end_date}T23:59:59`)) return { ok: false, reason: 'outside_menu_period' };
    const weekday = WEEKDAYS[date.getDay()];
    if (Array.isArray(menu.delivery_days) && menu.delivery_days.length && !menu.delivery_days.includes(weekday)) return { ok: false, reason: 'no_delivery' };
    return { ok: true, reason: 'available' };
  }

  function firstAvailableDate() {
    const menu = getCurrentMenu();
    const start = menu.start_date ? new Date(`${menu.start_date}T12:00:00`) : new Date();
    const date = new Date(Math.max(start.getTime(), Date.now()));
    date.setHours(12, 0, 0, 0);
    for (let i = 0; i < 45; i += 1) {
      const candidate = new Date(date);
      candidate.setDate(date.getDate() + i);
      if (isDateAvailable(candidate).ok) return candidate.toISOString().slice(0, 10);
    }
    return '';
  }

  function validateOrder() {
    const errors = [];
    const rules = getSettingRules();
    const totals = cartTotals();
    const customer = state.cart.customer;
    if (!state.cart.items.length) errors.push('Ajoutez au moins un plat au panier.');
    if (totals.subtotal < Number(rules.minimum_order || 0)) errors.push(`Minimum de commande: ${formatCurrency(rules.minimum_order || 0)}.`);
    if (!state.cart.deliveryDate || !isDateAvailable(new Date(`${state.cart.deliveryDate}T12:00:00`)).ok) errors.push('Choisissez une date de livraison disponible.');
    if (!customer.name.trim()) errors.push('Le nom complet est requis.');
    if (!customer.phone.trim()) errors.push('Le téléphone est requis.');
    if (!customer.streetNumber.trim() || !customer.streetName.trim()) errors.push('L’adresse de livraison est requise.');
    if (!customer.city.trim()) errors.push('La ville est requise.');
    const allowed = getEnabledZones().map((zone) => zone.city.toLowerCase());
    if (customer.city && !allowed.includes(customer.city.toLowerCase())) errors.push('La ville choisie n’est pas dans la zone de livraison.');
    return errors;
  }

  function buildCheckoutPayload() {
    const customer = state.cart.customer;
    return {
      items: state.cart.items.map((line) => ({ item_id: line.itemId, portion: line.portion, qty: line.qty })),
      delivery_date: state.cart.deliveryDate,
      customer: {
        name: customer.name, phone: customer.phone, email: customer.email, street_number: customer.streetNumber,
        street_name: customer.streetName, apartment: customer.apartment, city: customer.city, province: customer.province || 'QC',
        postal_code: (customer.postalCode || '').toUpperCase(), notes: customer.notes,
      },
    };
  }

  async function checkout() {
    const errors = validateOrder();
    if (errors.length) {
      showToast(errors[0]);
      render();
      return;
    }
    const endpoint = state.data?.settings?.ordering?.checkout_endpoint || '/api/create-checkout-session';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildCheckoutPayload()) });
      const payload = await response.json();
      if (!response.ok || !payload.checkout_url) throw new Error(payload.error || 'Session Stripe indisponible.');
      window.location.assign(payload.checkout_url);
    } catch (error) {
      showToast('Paiement sécurisé bientôt disponible. La commande est prête à être envoyée.');
      console.warn('Checkout non configuré:', error, buildCheckoutPayload());
    }
  }

  function showToast(message) {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function navHtml() {
    const nav = [
      ['home', 'Accueil'], ['menu', 'Menu'], ['commander', 'Commander'], ['traiteur', 'Traiteur'], ['livraison', 'Livraison'], ['contact', 'Contact'],
    ];
    const { count } = cartTotals();
    return `
      <header class="topbar container" id="topbar">
        <button class="brand" data-page="home" aria-label="Accueil La cuisine de Rosalie" style="border:0;background:transparent;cursor:pointer">
          <span class="brand-mark" aria-hidden="true">LR</span>
          <span class="brand-copy"><span class="brand-name">${escapeHtml(state.data.settings.business.name || 'La cuisine de Rosalie')}</span><span class="brand-tagline">${escapeHtml(state.data.settings.business.tagline)}</span></span>
        </button>
        <button class="mobile-menu" data-menu-toggle aria-expanded="false">Menu</button>
        <nav class="nav" aria-label="Navigation principale">
          ${nav.map(([id, label]) => `<button class="nav-btn" data-page="${id}" aria-current="${state.page === id}">${label}</button>`).join('')}
          <button class="nav-btn cart-nav" data-page="commander" aria-current="${state.page === 'commander'}">Panier <span class="cart-badge">${count}</span></button>
        </nav>
      </header>`;
  }

  function homeHtml() {
    const menuItems = getMenuItems().filter((item) => item.featured).slice(0, 3);
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    return `
      <section class="hero container">
        <div>
          <div class="kicker">Menu de la semaine • Livraison locale</div>
          <h1>${escapeHtml(state.data.content.home?.headline || 'Repas faits maison, livrés dans votre secteur.')}</h1>
          <p class="lead">${escapeHtml(state.data.content.home?.subheadline || '')}</p>
          <div class="cta-row"><button class="btn btn-primary" data-page="menu">Voir le menu de la semaine</button><button class="btn btn-secondary" data-page="commander">Planifier une commande</button></div>
          <div class="trust-chips"><span class="chip">Fait maison</span><span class="chip">Livraison locale</span><span class="chip">Commande 48 h à l’avance</span><span class="chip">Hygiène & salubrité alimentaires</span></div>
        </div>
        <div class="hero-visual">
          <img src="https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1400&q=82" alt="Repas maison préparé avec soin" loading="eager">
          <div class="hero-card"><strong>${escapeHtml(getCurrentMenu().title || 'Menu de la semaine')}</strong><span>Petit / Grand / Familial • livraison à céduler avec le client</span></div>
        </div>
      </section>
      <section class="section container">
        <div class="section-head"><div><div class="kicker">À commander maintenant</div><h2>Aperçu du menu</h2></div><button class="btn btn-ghost" data-page="menu">Tout voir</button></div>
        <div class="grid grid-3">${menuItems.map((item) => itemPreviewHtml(item)).join('')}</div>
      </section>
      <section class="section container grid grid-4">
        ${['Choisissez vos plats', 'Sélectionnez Petit, Grand ou Familial', 'Planifiez votre livraison', 'Savourez vos repas faits maison'].map((text, index) => `<div class="card mini-card"><strong>${index + 1}. ${text}</strong><p>Un parcours simple, pensé pour commander rapidement sur téléphone.</p></div>`).join('')}
      </section>
      <section class="section container panel">
        <div class="section-head"><div><div class="kicker">Secteur desservi</div><h2>Livraison locale</h2><p>Livraison disponible à ${escapeHtml(zones)}.</p></div><button class="btn btn-primary" data-page="livraison">Voir les règles</button></div>
      </section>`;
  }

  function itemPreviewHtml(item) {
    const portions = getPortions(item);
    return `<article class="card menu-card" style="grid-template-columns:1fr"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy"><div class="menu-card-body"><span class="badge">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="chip-row">${portions.map((p) => `<span class="chip">${p.label} ${formatCurrency(p.price)}</span>`).join('')}</div></div></article>`;
  }

  function menuPageHtml() {
    const menu = getCurrentMenu();
    const rules = getSettingRules();
    const promos = (state.data.promotions.active || []).filter((promo) => promo.enabled);
    return `
      <div class="container menu-layout">
        <div>
          <section class="menu-header">
            <div class="kicker">Menu en rotation</div><h1>${escapeHtml(menu.title || 'Menu de la semaine')}</h1>
            <p class="lead">${escapeHtml(menu.description || 'Menu disponible pour commandes planifiées.')}</p>
            <div class="chip-row"><span class="chip">Commande ${rules.order_notice_hours || 48} h à l’avance</span><span class="chip">Livraison locale disponible</span><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span></div>
          </section>
          ${promos.length ? `<section class="section panel promo"><strong>${escapeHtml(promos[0].title)}</strong><p>${escapeHtml(promos[0].description)}</p></section>` : ''}
          ${menuSectionHtml('Plats principaux', getMenuItems('items'))}
          ${menuSectionHtml('Accompagnements & extras', getMenuItems('extras'))}
        </div>
        ${cartPanelHtml(true)}
      </div>`;
  }

  function menuSectionHtml(title, items) {
    return `<section class="section"><div class="menu-section-title"><h2>${escapeHtml(title)}</h2></div><div class="grid">${items.map(menuItemHtml).join('')}</div></section>`;
  }

  function menuItemHtml(item) {
    const portions = getPortions(item);
    const selected = state.selectedPortions[item.id] || portions[0]?.key || 'standard';
    const qty = state.quantities[item.id] || 1;
    return `<article class="card menu-card ${item.available === false ? 'unavailable' : ''}">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="menu-card-body">
        <span class="badge">${item.available === false ? 'De retour bientôt' : escapeHtml(item.category)}</span>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
        <div class="portion-grid" role="group" aria-label="Portions pour ${escapeHtml(item.title)}">
          ${portions.map((portion) => `<button class="portion-btn ${selected === portion.key ? 'active' : ''}" data-portion="${item.id}:${portion.key}">${portion.label}<small>${formatCurrency(portion.price)}</small></button>`).join('')}
        </div>
        <div class="item-actions">
          <div class="qty" aria-label="Quantité"><button data-menu-qty="${item.id}:-1" aria-label="Réduire">−</button><span>${qty}</span><button data-menu-qty="${item.id}:1" aria-label="Augmenter">+</button></div>
          <button class="btn btn-primary" data-add="${item.id}" ${item.available === false ? 'disabled' : ''}>Ajouter</button>
        </div>
      </div>
    </article>`;
  }

  function cartPanelHtml(includeButton = false) {
    const totals = cartTotals();
    const rules = getSettingRules();
    const lines = state.cart.items.map((line) => cartLineHtml(line)).join('');
    const min = Number(rules.minimum_order || 0);
    const threshold = Number(rules.free_delivery_threshold || 0);
    return `<aside class="cart-panel card" aria-label="Votre panier"><h2>Votre panier</h2>
      ${state.cart.items.length ? `<div class="cart-lines">${lines}</div>` : `<div class="cart-empty">Votre panier est vide. Ajoutez un plat du menu de la semaine.</div>`}
      <div class="cart-total"><span>Sous-total</span><span>${formatCurrency(totals.subtotal)}</span></div>
      ${totals.subtotal > 0 && totals.subtotal < min ? `<p class="notice">Minimum de commande: ${formatCurrency(min)}. Ajoutez ${formatCurrency(min - totals.subtotal)} pour commander.</p>` : ''}
      ${totals.subtotal >= threshold ? `<p class="notice success-note">Livraison gratuite atteinte (${formatCurrency(threshold)} et plus).</p>` : `<p class="notice">Livraison gratuite à partir de ${formatCurrency(threshold)}.</p>`}
      ${includeButton ? `<button class="btn btn-primary" data-page="commander" style="width:100%;margin-top:12px">Voir le panier</button>` : ''}
    </aside>`;
  }

  function cartLineHtml(line) {
    return `<div class="cart-line"><div class="line-top"><div><div class="line-title">${escapeHtml(line.title)}</div><div class="line-meta">${escapeHtml(line.portionLabel)} • ${formatCurrency(line.price)}</div></div><strong>${formatCurrency(line.price * line.qty)}</strong></div><div class="line-actions"><div class="qty"><button data-line-qty="${line.itemId}:${line.portion}:-1" aria-label="Réduire">−</button><span>${line.qty}</span><button data-line-qty="${line.itemId}:${line.portion}:1" aria-label="Augmenter">+</button></div><button class="remove-btn" data-remove="${line.itemId}:${line.portion}">Retirer</button></div></div>`;
  }

  function commanderHtml() {
    if (!state.cart.deliveryDate) state.cart.deliveryDate = firstAvailableDate();
    const errors = validateOrder();
    const totals = cartTotals();
    return `<div class="container checkout-grid">
      <div class="grid">
        <section class="card step"><h2><span class="step-number">1</span>Votre commande</h2>${cartPanelHtml(false)}</section>
        <section class="card step"><h2><span class="step-number">2</span>Date de livraison</h2>${dateSelectorHtml()}</section>
        <section class="card step"><h2><span class="step-number">3</span>Coordonnées</h2>${customerFormHtml()}</section>
      </div>
      <aside class="card cart-panel"><h2>Confirmation</h2><p class="line-meta">Date: ${state.cart.deliveryDate ? formatDate(state.cart.deliveryDate) : 'Aucune date disponible'}</p><div class="summary-row"><span>Total</span><span>${formatCurrency(totals.subtotal)}</span></div>${errors.length ? `<div class="notice">${errors.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success-note">Commande prête pour le paiement sécurisé.</div>`}<button class="btn btn-primary" data-checkout style="width:100%;margin-top:12px">Passer au paiement sécurisé</button><p class="line-meta">Le serveur validera les prix officiels, la ville, la date et les règles avant paiement Stripe sécurisé.</p></aside>
    </div>`;
  }

  function dateSelectorHtml() {
    const first = firstAvailableDate();
    const start = first ? new Date(`${first}T12:00:00`) : new Date();
    const buttons = [];
    for (let i = 0; i < 14; i += 1) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const status = isDateAvailable(date);
      buttons.push(`<button class="date-btn ${status.ok ? '' : 'disabled'} ${state.cart.deliveryDate === iso ? 'selected' : ''}" data-date="${iso}" ${status.ok ? '' : 'disabled'}><strong>${new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' }).format(date)}</strong><span>${DATE_REASONS[status.reason]}</span></button>`);
    }
    return `<p>${first ? `Prochaine livraison disponible: <strong>${formatDate(first)}</strong>.` : 'Aucune date disponible dans la période du menu avec le délai de 48 h.'}</p><div class="date-grid">${buttons.join('')}</div><p class="line-meta">Jours de livraison: ${(getCurrentMenu().delivery_days || []).map((day) => WEEKDAY_LABELS[day] || day).join(', ') || 'à confirmer'}.</p>`;
  }

  function customerFormHtml() {
    const c = state.cart.customer;
    const zones = getEnabledZones();
    const input = (key, label, attrs = '') => `<div class="field"><label for="${key}">${label}</label><input id="${key}" data-customer="${key}" value="${escapeHtml(c[key] || '')}" ${attrs}></div>`;
    return `<div class="form-grid">
      ${input('name', 'Nom complet', 'autocomplete="name"')}${input('phone', 'Téléphone', 'autocomplete="tel"')}${input('email', 'Courriel (optionnel)', 'autocomplete="email" type="email"')}${input('streetNumber', 'Numéro civique')}${input('streetName', 'Rue', 'autocomplete="address-line1"')}${input('apartment', 'Appartement')}
      <div class="field"><label for="city">Ville</label><select id="city" data-customer="city"><option value="">Choisir une ville</option>${zones.map((zone) => `<option value="${escapeHtml(zone.city)}" ${c.city === zone.city ? 'selected' : ''}>${escapeHtml(zone.city)}</option>`).join('')}</select></div>
      ${input('postalCode', 'Code postal', 'autocomplete="postal-code"')}
      <div class="field full"><label for="notes">Instructions, allergies ou commentaires</label><textarea id="notes" data-customer="notes">${escapeHtml(c.notes || '')}</textarea></div>
    </div>`;
  }

  function traiteurHtml() {
    const services = ['Événements familiaux', 'Petits groupes', 'Repas préparés', 'Plateaux / formats familiaux', 'Menus personnalisés'];
    return `<section class="container hero"><div><div class="kicker">Traiteur & événements</div><h1>Des repas faits maison pour vos moments importants.</h1><p class="lead">Repas familiaux, événements privés, réunions et repas corporatifs: Rosalie peut préparer une proposition adaptée à votre groupe.</p><div class="quote-list">${services.map((service) => `<div class="quote-item">${service}</div>`).join('')}</div></div><div class="panel"><h2>Demander une soumission</h2><form class="form-grid" action="mailto:${escapeHtml(state.data.settings.business.email || state.data.settings.business.phone)}" method="post" enctype="text/plain"><div class="field"><label>Nom</label><input name="nom"></div><div class="field"><label>Téléphone / courriel</label><input name="contact"></div><div class="field"><label>Date de l’événement</label><input name="date" type="date"></div><div class="field"><label>Nombre de personnes</label><input name="personnes" type="number" min="1"></div><div class="field"><label>Ville</label><input name="ville"></div><div class="field"><label>Type d’événement</label><input name="type"></div><div class="field full"><label>Message</label><textarea name="message"></textarea></div><button class="btn btn-primary" type="submit">Demander une soumission</button></form></div></section>`;
  }

  function livraisonHtml() {
    const rules = getSettingRules();
    const zones = getEnabledZones();
    return `<div class="container grid grid-2"><section class="panel"><div class="kicker">Livraison</div><h1 class="page-title">Des règles claires avant de commander.</h1><p>Les commandes doivent être placées au moins ${rules.order_notice_hours || 48} h à l’avance afin de garantir la préparation.</p><div class="grid grid-2">${zones.map((zone) => `<div class="mini-card card"><strong>${escapeHtml(zone.city)}</strong><span>${escapeHtml(zone.province)}</span></div>`).join('')}</div><div class="chip-row"><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span><span class="chip">Livraison gratuite ${formatCurrency(rules.free_delivery_threshold || 35)} et plus</span><span class="chip">Livraison à céduler avec le client</span></div></section><aside class="zone-map"><div>Zone locale<br><span style="font-size:2.4rem">Contrecoeur • Sorel • Varennes • Verchères</span><br>Saint-Roch-de-Richelieu</div></aside></div>`;
  }

  function contactHtml() {
    const business = state.data.settings.business;
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    return `<section class="container grid grid-2"><div class="panel"><div class="kicker">Contact</div><h1 class="page-title">Une question ou une commande spéciale?</h1><p>Réponse locale et humaine pour vos repas de la semaine, formats familiaux et demandes traiteur.</p><div class="grid"><a class="btn btn-primary" href="tel:${escapeHtml(business.phone)}">Téléphone: ${escapeHtml(business.phone)}</a><a class="btn btn-secondary" href="${escapeHtml(business.facebook_url)}" target="_blank" rel="noopener">Facebook</a><a class="btn btn-secondary" href="${escapeHtml(business.messenger_url || business.facebook_url)}" target="_blank" rel="noopener">Messenger</a></div></div><div class="panel"><h2>Informations utiles</h2><p><strong>Zones:</strong> ${escapeHtml(zones)}.</p><p><strong>Commande:</strong> au moins ${getSettingRules().order_notice_hours || 48} h à l’avance.</p><p><strong>Confiance:</strong> ${escapeHtml(state.data.settings.trust.hygiene_statement)}</p><p class="notice">À confirmer avant lancement: minimum exact, modalités de livraison gratuite, jours de livraison, paiement et rabais de référence.</p></div></section>`;
  }

  function footerHtml() {
    return `<footer class="footer container"><div class="footer-grid"><div><strong>La cuisine de Rosalie</strong><p>Repas faits maison • Livraison locale • Portions Petit / Grand / Familial</p></div><div><strong>Commande</strong><p>48 h à l’avance<br>Minimum ${formatCurrency(getSettingRules().minimum_order || 35)}</p></div><div><strong>Contact</strong><p>${escapeHtml(state.data.settings.business.phone)}<br><a href="${escapeHtml(state.data.settings.business.facebook_url)}">Facebook</a></p></div></div></footer>`;
  }

  function mobileCartBarHtml() {
    const totals = cartTotals();
    return `<div class="mobile-cart-bar"><span>${totals.count} article${totals.count > 1 ? 's' : ''} • ${formatCurrency(totals.subtotal)}</span><button data-page="commander">Voir le panier</button></div>`;
  }

  function render() {
    const root = document.getElementById('webframe-root');
    const pages = { home: homeHtml, menu: menuPageHtml, commander: commanderHtml, traiteur: traiteurHtml, livraison: livraisonHtml, contact: contactHtml };
    root.innerHTML = `<div class="site">${navHtml()}<main>${(pages[state.page] || homeHtml)()}</main>${footerHtml()}${mobileCartBarHtml()}<div class="toast" role="status" aria-live="polite"></div></div>`;
    bindEvents(root);
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
    root.querySelector('[data-menu-toggle]')?.addEventListener('click', (event) => {
      const topbar = root.querySelector('#topbar');
      topbar.classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', topbar.classList.contains('open'));
    });
    root.querySelectorAll('[data-portion]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion] = button.dataset.portion.split(':'); state.selectedPortions[itemId] = portion; render();
    }));
    root.querySelectorAll('[data-menu-qty]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, delta] = button.dataset.menuQty.split(':'); state.quantities[itemId] = Math.max(1, (state.quantities[itemId] || 1) + Number(delta)); render();
    }));
    root.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
      const item = getItemById(button.dataset.add); if (!item) return;
      const portion = state.selectedPortions[item.id] || getPortions(item)[0]?.key; addToCart(item, portion, state.quantities[item.id] || 1);
    }));
    root.querySelectorAll('[data-line-qty]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion, delta] = button.dataset.lineQty.split(':'); changeLineQty(itemId, portion, Number(delta));
    }));
    root.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion] = button.dataset.remove.split(':'); removeLine(itemId, portion);
    }));
    root.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => { state.cart.deliveryDate = button.dataset.date; saveCart(); render(); }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('input', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart();
    }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('change', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart(); render();
    }));
    root.querySelector('[data-checkout]')?.addEventListener('click', checkout);
  }

  async function init() {
    injectStyles();
    loadCart();
    state.data = await loadData();
    setSeo(state.data.content);
    const first = firstAvailableDate();
    if (!state.cart.deliveryDate && first) state.cart.deliveryDate = first;
    render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
