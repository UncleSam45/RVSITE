// Cloudflare Worker for La cuisine de Rosalie Stripe Checkout.
// Delivery-date validation is intentionally independent from menu dates:
// the menu window controls whether orders are accepted, while delivery dates
// only need to be 72h+ in advance and not on Saturday/Sunday.

const STRIPE_CHECKOUT_URL = 'https://api.stripe.com/v1/checkout/sessions';
const DEFAULT_CURRENCY = 'cad';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKEND_DAYS = new Set(['saturday', 'sunday']);
const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    if (request.method === 'GET' && ['/api/health', '/health'].includes(url.pathname)) {
      return json({ ok: true, service: 'la-cuisine-de-rosalie-checkout-worker' }, 200, request, env);
    }

    const checkoutRoutes = [
      '/api/create-checkout-session',
      '/create-checkout-session',
      '/api/create-checkout-session-v2',
      '/create-checkout-session-v2',
    ];
    if (request.method === 'POST' && checkoutRoutes.includes(url.pathname)) {
      try {
        return await createCheckoutSession(request, env);
      } catch (error) {
        console.error('Checkout error:', error);
        return json({ error: error.publicMessage || 'Impossible de préparer le paiement.' }, error.status || 400, request, env);
      }
    }

    return json({ error: 'Route API introuvable.' }, 404, request, env);
  },
};

async function createCheckoutSession(request, env) {
  if (!env.STRIPE_SECRET_KEY || !/^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY)) {
    throw publicError('Configuration Stripe manquante côté serveur.', 500);
  }

  const orderPayload = await readJsonBody(request);
  const publicSiteOrigin = getPublicSiteOrigin(request, env);
  const site = await loadPublicSiteData(publicSiteOrigin);
  const catalog = await loadStripeCatalog(env, publicSiteOrigin);
  const validatedOrder = validateOrder(orderPayload, site);
  const lineItems = buildStripeLineItems(validatedOrder.lines, catalog, site, env);

  const orderId = makeOrderId();
  const successUrl = env.CHECKOUT_SUCCESS_URL || `${publicSiteOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = env.CHECKOUT_CANCEL_URL || `${publicSiteOrigin}/?checkout=cancel`;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('locale', 'fr');
  form.set('submit_type', 'pay');
  form.set('client_reference_id', orderId);
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('phone_number_collection[enabled]', 'true');
  if (validatedOrder.customer.email) form.set('customer_email', validatedOrder.customer.email);

  lineItems.forEach((lineItem, index) => {
    if (lineItem.price) {
      form.set(`line_items[${index}][price]`, lineItem.price);
    } else {
      form.set(`line_items[${index}][price_data][currency]`, lineItem.price_data.currency);
      form.set(`line_items[${index}][price_data][unit_amount]`, String(lineItem.price_data.unit_amount));
      form.set(`line_items[${index}][price_data][product_data][name]`, lineItem.price_data.product_data.name);
      if (lineItem.price_data.product_data.description) {
        form.set(`line_items[${index}][price_data][product_data][description]`, lineItem.price_data.product_data.description);
      }
    }
    form.set(`line_items[${index}][quantity]`, String(lineItem.quantity));
  });

  const metadata = buildMetadata(orderId, validatedOrder, site);
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, truncateMetadata(value));
    form.set(`payment_intent_data[metadata][${key}]`, truncateMetadata(value));
  }

  const stripeResponse = await fetch(STRIPE_CHECKOUT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const stripePayload = await stripeResponse.json().catch(() => ({}));
  if (!stripeResponse.ok || !stripePayload.url) {
    throw publicError(stripePayload?.error?.message || 'Stripe a refusé la création de session.', 502);
  }

  return json({ checkout_url: stripePayload.url, order_id: orderId, checkout_session_id: stripePayload.id }, 200, request, env);
}

async function readJsonBody(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw publicError('Requête invalide: JSON requis.', 415);
  try { return await request.json(); } catch { throw publicError('JSON de commande invalide.', 400); }
}

function getPublicSiteOrigin(request, env) {
  const fallback = new URL(request.url).origin;
  try { return new URL(env.PUBLIC_SITE_ORIGIN || fallback).origin; } catch { return fallback; }
}

async function loadPublicSiteData(origin) {
  const [settings, menus, items, delivery] = await Promise.all([
    fetchPublicJson(origin, 'assets/data/settings.json'),
    fetchPublicJson(origin, 'assets/data/menus.json'),
    fetchPublicJson(origin, 'assets/data/items.json'),
    fetchPublicJson(origin, 'assets/data/delivery.json'),
  ]);
  return { settings, menus, items, delivery };
}

async function fetchPublicJson(origin, path) {
  const response = await fetch(`${origin}/${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw publicError(`Données publiques indisponibles: ${path}`, 502);
  try { return await response.json(); } catch { throw publicError(`JSON public invalide: ${path}`, 502); }
}

async function loadStripeCatalog(env, origin) {
  if (env.STRIPE_CATALOG_JSON) {
    try { return JSON.parse(env.STRIPE_CATALOG_JSON); } catch { throw publicError('STRIPE_CATALOG_JSON est invalide.', 500); }
  }
  try {
    const response = await fetch(`${origin}/assets/data/stripe_catalog.json?v=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) return await response.json();
  } catch {}
  return {};
}

function validateOrder(payload, site) {
  if (!payload || typeof payload !== 'object') throw publicError('Commande invalide.', 400);
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw publicError('Le panier est vide.', 400);

  const ordering = site.settings?.ordering || {};
  if (ordering.enabled === false) throw publicError('Les commandes en ligne sont désactivées.', 400);

  const menu = site.menus?.current_menu || {};
  validateMenuOrderingWindow(menu);

  const activeIds = new Set([...(Array.isArray(menu.item_ids) ? menu.item_ids : []), ...(Array.isArray(menu.extra_ids) ? menu.extra_ids : [])]);
  const allItems = Array.isArray(site.items?.items) ? site.items.items : [];
  const itemById = new Map(allItems.map((item) => [String(item.id || ''), item]));

  const customer = normalizeCustomer(payload.customer || {});
  validateCustomer(customer, site.delivery);
  const deliveryDate = normalizeIsoDate(payload.delivery_date);
  validateDeliveryDate(deliveryDate, site);

  const lines = [];
  let subtotalCents = 0;
  for (const rawLine of payload.items.slice(0, 50)) {
    const itemId = clean(rawLine?.item_id);
    const portion = clean(rawLine?.portion);
    const qty = clampInt(rawLine?.qty, 1, 99);
    const item = itemById.get(itemId);
    if (!item || !activeIds.has(itemId) || item.available === false) throw publicError('Un item du panier n’est plus disponible.', 400);
    const unitPrice = Number(item.pricing?.[portion]);
    if (!portion || !Number.isFinite(unitPrice) || unitPrice <= 0) throw publicError(`Format invalide pour ${item.title || itemId}.`, 400);
    const unitAmount = Math.round(unitPrice * 100);
    subtotalCents += unitAmount * qty;
    lines.push({ item, itemId, portion, portionLabel: PORTION_LABELS[portion] || portion, qty, unitAmount });
  }

  const minimumOrder = Number(site.settings?.ordering?.minimum_order || site.delivery?.rules?.minimum_order || 0);
  if (subtotalCents < Math.round(minimumOrder * 100)) throw publicError(`Minimum de commande: ${minimumOrder.toFixed(2)} $.`, 400);
  return { lines, subtotalCents, customer, deliveryDate };
}

function validateMenuOrderingWindow(menu) {
  if (menu.active === false) throw publicError('Le menu courant n’est pas actif.', 400);
  const time = Date.now();
  if (menu.order_open_at && time < new Date(menu.order_open_at).getTime()) throw publicError('Les commandes pour ce menu ne sont pas encore ouvertes.', 400);
  if (menu.order_close_at && time > new Date(menu.order_close_at).getTime()) throw publicError('Les commandes pour ce menu sont fermées.', 400);
}

function validateDeliveryDate(dateIso, site) {
  if (!dateIso) throw publicError('Choisissez une date de livraison disponible.', 400);
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw publicError('Date de livraison invalide.', 400);

  const ordering = site.settings?.ordering || {};
  const rules = site.delivery?.rules || {};
  const noticeHours = Number(ordering.order_notice_hours || rules.order_notice_hours || 48);
  const deliveryEndOfDay = new Date(`${dateIso}T23:59:59Z`);
  if (deliveryEndOfDay.getTime() < Date.now() + noticeHours * 60 * 60 * 1000) {
    throw publicError('Cette date ne respecte pas le délai de préparation.', 400);
  }

  if (WEEKEND_DAYS.has(WEEKDAYS[date.getUTCDay()])) {
    throw publicError('La livraison n’est pas offerte les samedis et dimanches.', 400);
  }
}

function validateCustomer(customer, delivery) {
  if (!customer.name) throw publicError('Le nom complet est requis.', 400);
  if (!customer.phone) throw publicError('Le téléphone est requis.', 400);
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw publicError('Le courriel est invalide.', 400);
  if (!customer.street_number || !customer.street_name) throw publicError('L’adresse de livraison est requise.', 400);
  if (!customer.city) throw publicError('La ville est requise.', 400);
  const zones = Array.isArray(delivery?.zones) ? delivery.zones.filter((zone) => zone.enabled !== false) : [];
  const allowedCities = zones.map((zone) => clean(zone.city).toLowerCase()).filter(Boolean);
  if (allowedCities.length && !allowedCities.includes(customer.city.toLowerCase())) throw publicError('La ville choisie n’est pas dans la zone de livraison.', 400);
}

function buildStripeLineItems(lines, catalog, site, env) {
  const currency = normalizeCurrency(catalog?.currency || site.settings?.ordering?.currency || DEFAULT_CURRENCY);
  const allowDynamicPriceData = env.ALLOW_DYNAMIC_PRICE_DATA === 'true' || catalog?.allow_dynamic_price_data === true;
  return lines.map((line) => {
    const catalogPrice = findCatalogPrice(catalog, line.itemId, line.portion);
    if (catalogPrice?.priceId) {
      if (catalogPrice.unitAmount !== null && catalogPrice.unitAmount !== undefined && catalogPrice.unitAmount !== line.unitAmount) {
        throw publicError(`Le catalogue Stripe est désynchronisé pour ${line.item.title || line.itemId}.`, 409);
      }
      return { price: catalogPrice.priceId, quantity: line.qty };
    }
    if (!allowDynamicPriceData) throw publicError(`Prix Stripe manquant pour ${line.item.title || line.itemId} / ${line.portionLabel}.`, 409);
    return { quantity: line.qty, price_data: { currency, unit_amount: line.unitAmount, product_data: { name: `${line.item.title || line.itemId} — ${line.portionLabel}`, description: line.item.description || 'La cuisine de Rosalie' } } };
  });
}

function findCatalogPrice(catalog, itemId, portion) {
  const candidates = [catalog?.items?.[itemId]?.prices?.[portion], catalog?.products?.[itemId]?.prices?.[portion], catalog?.prices?.[itemId]?.[portion], catalog?.prices?.[`${itemId}:${portion}`], catalog?.prices?.[portion], catalog?.portion_prices?.[portion]];
  for (const candidate of candidates) {
    const parsed = parseCatalogPrice(candidate);
    if (parsed?.priceId) return parsed;
  }
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
  const raw = value.unit_amount ?? value.amount_cents ?? value.unit_amount_decimal;
  if (raw === undefined || raw === null || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeCustomer(customer) {
  return { name: clean(customer.name), phone: clean(customer.phone), email: clean(customer.email).toLowerCase(), street_number: clean(customer.street_number), street_name: clean(customer.street_name), apartment: clean(customer.apartment), city: clean(customer.city), province: clean(customer.province || 'QC'), postal_code: clean(customer.postal_code).toUpperCase(), notes: clean(customer.notes) };
}

function buildMetadata(orderId, order, site) {
  const customer = order.customer;
  const address = [customer.street_number, customer.street_name, customer.apartment, customer.city, customer.province, customer.postal_code].filter(Boolean).join(', ');
  const orderSummary = order.lines.map((line) => `${line.qty}x ${line.item.title || line.itemId} (${line.portionLabel})`).join('; ');
  return { order_id: orderId, project: 'rvsite', business: site.settings?.business?.name || 'La cuisine de Rosalie', delivery_date: order.deliveryDate, customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email || '', delivery_city: customer.city, delivery_address: address, order_summary: orderSummary, subtotal_cents: String(order.subtotalCents) };
}

function normalizeIsoDate(value) { const text = clean(value); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; }
function normalizeCurrency(value) { const currency = clean(value || DEFAULT_CURRENCY).toLowerCase(); return /^[a-z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY; }
function clampInt(value, min, max) { const number = Math.floor(Number(value)); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min; }
function makeOrderId() { return `rosalie_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`; }
function truncateMetadata(value) { return clean(value).slice(0, 500); }
function clean(value) { return String(value || '').trim(); }
function publicError(message, status = 400) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
function json(payload, status, request, env) { return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) } }); }
function corsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  if (allowedOrigin === '*') return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  const allowed = allowedOrigin.split(',').map((entry) => entry.trim()).filter(Boolean);
  return { 'Access-Control-Allow-Origin': allowed.includes(requestOrigin) ? requestOrigin : allowed[0] || '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}
