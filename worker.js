const STRIPE_CHECKOUT_URL = 'https://api.stripe.com/v1/checkout/sessions';
const STRIPE_PRICES_URL = 'https://api.stripe.com/v1/prices';
const DEFAULT_CURRENCY = 'cad';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKEND_DAYS = new Set(['saturday', 'sunday']);
const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method === 'GET' && ['/api/health', '/health'].includes(url.pathname)) {
      return json({ ok: true, service: 'la-cuisine-de-rosalie-checkout-worker', promotions: false }, 200, request, env);
    }
    const routes = ['/api/create-checkout-session', '/create-checkout-session', '/api/create-checkout-session-v2', '/create-checkout-session-v2'];
    if (request.method === 'POST' && routes.includes(url.pathname)) {
      try {
        return await createCheckoutSession(request, env);
      } catch (error) {
        console.error('Checkout error:', error);
        return json({ error: error.publicMessage || 'Le service de paiement est temporairement indisponible.' }, error.status || 500, request, env);
      }
    }
    return json({ error: 'Route API introuvable.' }, 404, request, env);
  },
};

async function createCheckoutSession(request, env) {
  if (!env.STRIPE_SECRET_KEY || !/^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY)) throw publicError('Configuration Stripe manquante côté serveur.', 500);
  const payload = await readJsonBody(request);
  const origin = getPublicSiteOrigin(request, env);
  const catalog = await loadCheckoutCatalog(env);
  const order = validateCatalogOrder(payload, catalog);
  const lineItems = buildStripeLineItems(order.lines, catalog, { settings: { ordering: { currency: catalog.currency || DEFAULT_CURRENCY } } }, env);
  const orderId = makeOrderId();
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('locale', 'fr');
  form.set('submit_type', 'pay');
  form.set('client_reference_id', orderId);
  form.set('success_url', env.CHECKOUT_SUCCESS_URL || `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', env.CHECKOUT_CANCEL_URL || `${origin}/?checkout=cancel`);
  form.set('phone_number_collection[enabled]', 'true');
  if (order.customer.email) form.set('customer_email', order.customer.email);

  lineItems.forEach((line, index) => {
    if (line.price) {
      form.set(`line_items[${index}][price]`, line.price);
    } else {
      form.set(`line_items[${index}][price_data][currency]`, line.price_data.currency);
      form.set(`line_items[${index}][price_data][unit_amount]`, String(line.price_data.unit_amount));
      form.set(`line_items[${index}][price_data][product_data][name]`, line.price_data.product_data.name);
      if (line.price_data.product_data.description) form.set(`line_items[${index}][price_data][product_data][description]`, line.price_data.product_data.description);
    }
    form.set(`line_items[${index}][quantity]`, String(line.quantity));
  });

  const metadata = buildMetadata(orderId, order, { settings: { business: { name: env.BUSINESS_NAME || 'La cuisine de Rosalie' } } });
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, truncateMetadata(value));
    form.set(`payment_intent_data[metadata][${key}]`, truncateMetadata(value));
  }

  let stripeResponse;
  try {
    stripeResponse = await fetch(STRIPE_CHECKOUT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
  } catch (error) {
    console.error('Stripe connection error:', error);
    throw publicError('Connexion à Stripe impossible. Veuillez réessayer dans quelques instants.', 502);
  }
  const stripe = await stripeResponse.json().catch(() => ({}));
  if (!stripeResponse.ok || !stripe.url) throw publicError(stripe?.error?.message || 'Stripe a refusé la création de session.', 502);

  return json({ checkout_url: stripe.url, order_id: orderId, checkout_session_id: stripe.id }, 200, request, env);
}

async function loadCheckoutCatalog(env) {
  if (env.STRIPE_CATALOG) return env.STRIPE_CATALOG;
  if (env.STRIPE_CATALOG_JSON) {
    try { return JSON.parse(env.STRIPE_CATALOG_JSON); } catch { throw publicError('STRIPE_CATALOG_JSON est invalide.', 500); }
  }
  const params = new URLSearchParams({ active: 'true', limit: '100', 'expand[]': 'data.product' });
  let response;
  try {
    response = await fetch(`${STRIPE_PRICES_URL}?${params}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  } catch (error) {
    console.error('Stripe catalog connection error:', error);
    throw publicError('Connexion au catalogue Stripe impossible.', 502);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw publicError(result?.error?.message || 'Catalogue Stripe indisponible.', 502);
  const catalog = { currency: DEFAULT_CURRENCY, items: {} };
  for (const price of result.data || []) {
    const product = typeof price.product === 'object' ? price.product : {};
    const itemId = clean(price.metadata?.item_id || product.metadata?.item_id);
    const portion = clean(price.metadata?.portion_key || product.metadata?.portion_key || price.nickname).toLowerCase();
    if (!itemId || !portion || !price.id) continue;
    catalog.currency = normalizeCurrency(price.currency || catalog.currency);
    catalog.items[itemId] ||= { title: product.name || itemId, prices: {} };
    catalog.items[itemId].prices[portion] = { price_id: price.id, unit_amount: Number(price.unit_amount || 0) };
  }
  if (!Object.keys(catalog.items).length) throw publicError('Aucun article du site n’est associé au catalogue Stripe.', 503);
  return catalog;
}

function validateCatalogOrder(payload, catalog) {
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) throw publicError('Le panier est vide.', 400);
  const customer = normalizeCustomer(payload.customer || {});
  if (!customer.name || !customer.phone || !customer.street_number || !customer.street_name || !customer.city) throw publicError('Les coordonnées de livraison sont incomplètes.', 400);
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw publicError('Le courriel est invalide.', 400);
  const deliveryDate = normalizeIsoDate(payload.delivery_date);
  const deliveryWindow1 = clean(payload.delivery_window_1);
  const deliveryWindow2 = clean(payload.delivery_window_2);
  if (!deliveryDate || !deliveryWindow1 || !deliveryWindow2 || deliveryWindow1 === deliveryWindow2) throw publicError('Les informations de livraison sont invalides.', 400);
  const lines = payload.items.slice(0, 50).map((raw) => {
    const itemId = clean(raw?.item_id); const portion = clean(raw?.portion); const qty = strictInt(raw?.qty, 1, 99);
    const entry = catalog?.items?.[itemId]; const price = findCatalogPrice(catalog, itemId, portion);
    if (!price?.priceId) throw publicError(`Prix Stripe introuvable pour ${entry?.title || itemId} / ${PORTION_LABELS[portion] || portion}.`, 409);
    return { itemId, portion, portionLabel: PORTION_LABELS[portion] || portion, qty, unitAmount: price.unitAmount || 0, item: { title: entry?.title || itemId } };
  });
  const paidSubtotalCents = lines.reduce((sum, line) => sum + line.unitAmount * line.qty, 0);
  return { lines, paidSubtotalCents, subtotalCents: paidSubtotalCents, customer, deliveryDate, deliveryWindow1, deliveryWindow2, coolerAvailable: payload.cooler_available === true, deliveryInstructions: clean(payload.delivery_instructions) };
}

async function readJsonBody(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw publicError('Requête invalide: JSON requis.', 415);
  try { return await request.json(); } catch { throw publicError('JSON de commande invalide.', 400); }
}

function getPublicSiteOrigin(request, env) {
  try { return new URL(env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin).origin; } catch { return new URL(request.url).origin; }
}

export function validateOrder(payload, site, now = new Date()) {
  if (!payload || typeof payload !== 'object') throw publicError('Commande invalide.', 400);
  if (!Array.isArray(payload.items) || !payload.items.length) throw publicError('Le panier est vide.', 400);
  if (site.settings?.ordering?.enabled === false) throw publicError('Les commandes en ligne sont désactivées.', 400);

  const menu = site.menus?.current_menu || {};
  validateMenuOrderingWindow(menu, now);
  const activeIds = new Set([
    ...(Array.isArray(menu.item_ids) ? menu.item_ids : []),
    ...(Array.isArray(menu.extra_ids) ? menu.extra_ids : []),
  ].map(String));
  const allItems = Array.isArray(site.items?.items) ? site.items.items : [];
  const itemById = new Map(allItems.map((item) => [String(item.id || ''), item]));
  const customer = normalizeCustomer(payload.customer || {});
  validateCustomer(customer, site.delivery);
  const deliveryDate = normalizeIsoDate(payload.delivery_date);
  const deliveryWindow1 = clean(payload.delivery_window_1);
  const deliveryWindow2 = clean(payload.delivery_window_2);
  validateDelivery(deliveryDate, deliveryWindow1, deliveryWindow2, site);

  const lines = [];
  let paidSubtotalCents = 0;
  for (const raw of payload.items.slice(0, 50)) {
    const itemId = clean(raw?.item_id);
    const portion = clean(raw?.portion);
    const qty = strictInt(raw?.qty, 1, 99);
    const item = itemById.get(itemId);
    if (!item || !activeIds.has(itemId) || item.available === false) throw publicError('Un item du panier n’est plus disponible.', 400);
    const unitPrice = Number(item.pricing?.[portion]);
    if (!portion || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw publicError(`Format invalide pour ${item.title || itemId}.`, 400);
    }
    const unitAmount = Math.round(unitPrice * 100);
    const line = { item, itemId, portion, portionLabel: PORTION_LABELS[portion] || portion, qty, unitAmount };
    lines.push(line);
    paidSubtotalCents += unitAmount * qty;
  }

  const minimum = Number(site.settings?.ordering?.minimum_order || site.delivery?.rules?.minimum_order || 0);
  if (paidSubtotalCents < Math.round(minimum * 100)) throw publicError(`Minimum de commande: ${minimum.toFixed(2)} $.`, 400);
  return {
    lines, subtotalCents: paidSubtotalCents, paidSubtotalCents,
    customer, deliveryDate, deliveryWindow1, deliveryWindow2,
    coolerAvailable: payload.cooler_available === true,
    deliveryInstructions: clean(payload.delivery_instructions),
  };
}

function validateMenuOrderingWindow(menu, now = new Date()) {
  if (menu.active === false) throw publicError('Le menu courant n’est pas actif.', 400);
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type) => local.find((part) => part.type === type)?.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  const open = (weekday === 5 && minutes >= 60) || weekday === 6 || weekday === 0 || weekday === 1 || weekday === 2 || (weekday === 3 && minutes < 720);
  if (!open) throw publicError('Les commandes sont ouvertes du vendredi à 1 h au mercredi à midi (heure de Montréal).', 400);
}

function validateDelivery(date, window1, window2, site) {
  validateDeliveryDate(date, site);
  if (!window1 || !window2) throw publicError('Veuillez choisir deux plages horaires de livraison.', 400);
  if (window1 === window2) throw publicError('Veuillez choisir deux plages horaires différentes.', 400);
  const allowed = Array.isArray(site.delivery?.delivery_windows) ? site.delivery.delivery_windows.map(clean) : [];
  if (allowed.length && (!allowed.includes(window1) || !allowed.includes(window2))) throw publicError('Une plage horaire de livraison est invalide.', 400);
}

function validateDeliveryDate(dateIso, site) {
  if (!dateIso) throw publicError('Choisissez une date de livraison disponible.', 400);
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw publicError('Date de livraison invalide.', 400);
  const notice = Number(site.settings?.ordering?.order_notice_hours || site.delivery?.rules?.order_notice_hours || 48);
  if (new Date(`${dateIso}T23:59:59Z`).getTime() < Date.now() + notice * 3600000) throw publicError('Cette date ne respecte pas le délai de préparation.', 400);
  if (WEEKEND_DAYS.has(WEEKDAYS[date.getUTCDay()])) throw publicError('La livraison n’est pas offerte les samedis et dimanches.', 400);
}

function validateCustomer(customer, delivery) {
  if (!customer.name) throw publicError('Le nom complet est requis.', 400);
  if (!customer.phone) throw publicError('Le téléphone est requis.', 400);
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw publicError('Le courriel est invalide.', 400);
  if (!customer.street_number || !customer.street_name) throw publicError('L’adresse de livraison est requise.', 400);
  if (!customer.city) throw publicError('La ville est requise.', 400);
  const cities = (Array.isArray(delivery?.zones) ? delivery.zones : []).filter((z) => z.enabled !== false).map((z) => clean(z.city).toLowerCase()).filter(Boolean);
  if (cities.length && !cities.includes(customer.city.toLowerCase())) throw publicError('La ville choisie n’est pas dans la zone de livraison.', 400);
}

export function buildStripeLineItems(lines, catalog, site, env) {
  const currency = normalizeCurrency(catalog?.currency || site.settings?.ordering?.currency || DEFAULT_CURRENCY);
  const allowDynamic = env.ALLOW_DYNAMIC_PRICE_DATA === 'true' || catalog?.allow_dynamic_price_data === true;
  return lines.map((line) => {
    const catalogPrice = findCatalogPrice(catalog, line.itemId, line.portion);
    if (catalogPrice?.priceId) {
      if (catalogPrice.unitAmount !== null && catalogPrice.unitAmount !== line.unitAmount) {
        throw publicError(`Le catalogue Stripe est désynchronisé pour ${line.item.title || line.itemId}.`, 409);
      }
      return { price: catalogPrice.priceId, quantity: line.qty };
    }
    if (line.promotional) throw publicError(`Prix Stripe promotionnel manquant pour ${line.item.title || line.itemId}.`, 409);
    if (!allowDynamic) throw publicError(`Prix Stripe manquant pour ${line.item.title || line.itemId} / ${line.portionLabel}.`, 409);
    return { quantity: line.qty, price_data: { currency, unit_amount: line.unitAmount, product_data: { name: `${line.item.title || line.itemId} — ${line.portionLabel}`, description: line.item.description || 'La cuisine de Rosalie' } } };
  });
}

function findCatalogPrice(catalog, itemId, portion) {
  const candidates = [catalog?.items?.[itemId]?.prices?.[portion], catalog?.products?.[itemId]?.prices?.[portion], catalog?.prices?.[itemId]?.[portion], catalog?.prices?.[`${itemId}:${portion}`], catalog?.prices?.[portion], catalog?.portion_prices?.[portion]];
  for (const value of candidates) { const parsed = parseCatalogPrice(value); if (parsed?.priceId) return parsed; }
  return null;
}

function parseCatalogPrice(value) {
  if (!value) return null;
  if (typeof value === 'string') return { priceId: value, unitAmount: null };
  if (typeof value !== 'object') return null;
  const priceId = clean(value.stripe_price_id || value.price_id || value.price || value.id);
  return priceId ? { priceId, unitAmount: readUnitAmount(value) } : null;
}

function readUnitAmount(value) {
  const cents = value.unit_amount ?? value.amount_cents ?? value.unit_amount_decimal;
  if (cents !== undefined && cents !== null && cents !== '') return Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : null;
  if (value.amount !== undefined && value.amount !== null && value.amount !== '') return Number.isFinite(Number(value.amount)) ? Math.round(Number(value.amount) * 100) : null;
  return null;
}

function normalizeCustomer(customer) {
  return { name: clean(customer.name), phone: clean(customer.phone), email: clean(customer.email).toLowerCase(), street_number: clean(customer.street_number), street_name: clean(customer.street_name), apartment: clean(customer.apartment), city: clean(customer.city), province: clean(customer.province || 'QC'), postal_code: clean(customer.postal_code).toUpperCase(), notes: clean(customer.notes) };
}

function buildMetadata(orderId, order, site) {
  const customer = order.customer;
  const address = [customer.street_number, customer.street_name, customer.apartment, customer.city, customer.province, customer.postal_code].filter(Boolean).join(', ');
  const summary = order.lines.map((line) => `${line.qty}x ${line.item.title || line.itemId} (${line.portionLabel})`).join('; ');
  return {
    order_id: orderId, project: 'rvsite', business: site.settings?.business?.name || 'La cuisine de Rosalie',
    delivery_date: order.deliveryDate, delivery_window_1: order.deliveryWindow1, delivery_window_2: order.deliveryWindow2,
    cooler_available: order.coolerAvailable ? 'Oui' : 'Non', delivery_instructions: order.deliveryInstructions,
    customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email || '',
    delivery_city: customer.city, delivery_address: address, order_summary: summary,
    subtotal_cents: String(order.paidSubtotalCents),
  };
}

function normalizeIsoDate(value) { const text = clean(value); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; }
function normalizeCurrency(value) { const currency = clean(value || DEFAULT_CURRENCY).toLowerCase(); return /^[a-z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY; }
function strictInt(value, min, max) { const number = Number(value); if (!Number.isInteger(number) || number < min || number > max) throw publicError('Quantité invalide.', 400); return number; }
function makeOrderId() { return `rosalie_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`; }
function truncateMetadata(value) { return clean(value).slice(0, 500); }
function clean(value) { return String(value ?? '').trim(); }
function publicError(message, status = 400) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
function json(payload, status, request, env) { return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) } }); }
function corsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  if (allowedOrigin === '*') return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  const allowed = allowedOrigin.split(',').map((x) => x.trim()).filter(Boolean);
  return { 'Access-Control-Allow-Origin': allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}
