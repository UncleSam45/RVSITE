/**
 * Cloudflare Worker — La cuisine de Rosalie Stripe Checkout
 *
 * Deploy this file as the Worker entry point. Required secret:
 *   STRIPE_SECRET_KEY
 * Recommended variable:
 *   PUBLIC_SITE_ORIGIN=https://lacuisinederosalie.ca
 * Optional variable:
 *   STRIPE_CATALOG_JSON (Stripe Price IDs); without it this Worker creates
 *   Stripe price_data from the server-fetched, authoritative item JSON.
 */

const STRIPE_CHECKOUT_URL = 'https://api.stripe.com/v1/checkout/sessions';
const DEFAULT_SITE_ORIGIN = 'https://lacuisinederosalie.ca';
const DEFAULT_CURRENCY = 'cad';
const DEFAULT_TIMEZONE = 'America/Toronto';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method === 'GET' && ['/health', '/api/health'].includes(url.pathname)) return json({ ok: true, service: 'la-cuisine-de-rosalie-checkout-worker' }, 200, request, env);
    if (request.method !== 'POST' || !['/api/create-checkout-session', '/create-checkout-session', '/api/create-checkout-session-v2', '/create-checkout-session-v2'].includes(url.pathname)) return json({ error: 'Route API introuvable.' }, 404, request, env);

    try {
      return await createCheckoutSession(request, env);
    } catch (error) {
      console.error('[Rosalie checkout]', error);
      return json({ error: error.publicMessage || 'Impossible de préparer le paiement.' }, error.status || 500, request, env);
    }
  },
};

async function createCheckoutSession(request, env) {
  if (!/^sk_(test|live)_/.test(String(env.STRIPE_SECRET_KEY || ''))) throw publicError('Configuration Stripe manquante côté serveur.', 500);

  const payload = await readJsonBody(request);
  const origin = publicSiteOrigin(env);
  const site = await loadSiteData(origin);
  const order = validateOrder(payload, site, new Date());
  const catalog = await loadStripeCatalog(env, origin);
  const lineItems = buildStripeLineItems(order.lines, catalog, site.settings);
  const orderId = makeOrderId();
  const metadata = buildMetadata(orderId, order, site, new Date());
  const form = stripeForm(orderId, order, lineItems, metadata, env, origin);

  const response = await fetch(STRIPE_CHECKOUT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const stripe = await response.json().catch(() => ({}));
  if (!response.ok || !stripe.url) throw publicError(stripe?.error?.message || 'Stripe a refusé la création de session.', 502);
  return json({ checkout_url: stripe.url, order_id: orderId, checkout_session_id: stripe.id }, 200, request, env);
}

function stripeForm(orderId, order, lineItems, metadata, env, origin) {
  const form = new URLSearchParams({
    mode: 'payment', locale: 'fr', submit_type: 'pay', client_reference_id: orderId,
    success_url: env.CHECKOUT_SUCCESS_URL || `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.CHECKOUT_CANCEL_URL || `${origin}/?checkout=cancel`,
    'phone_number_collection[enabled]': 'true',
  });
  if (order.customer.email) form.set('customer_email', order.customer.email);
  lineItems.forEach((line, index) => {
    if (line.price) form.set(`line_items[${index}][price]`, line.price);
    else {
      form.set(`line_items[${index}][price_data][currency]`, line.price_data.currency);
      form.set(`line_items[${index}][price_data][unit_amount]`, String(line.price_data.unit_amount));
      form.set(`line_items[${index}][price_data][product_data][name]`, line.price_data.product_data.name);
      if (line.price_data.product_data.description) form.set(`line_items[${index}][price_data][product_data][description]`, line.price_data.product_data.description);
    }
    form.set(`line_items[${index}][quantity]`, String(line.quantity));
  });
  Object.entries(metadata).forEach(([key, value]) => {
    form.set(`metadata[${key}]`, truncateMetadata(value));
    form.set(`payment_intent_data[metadata][${key}]`, truncateMetadata(value));
  });
  return form;
}

async function readJsonBody(request) {
  if (!String(request.headers.get('content-type') || '').includes('application/json')) throw publicError('Requête invalide: JSON requis.', 415);
  try { return await request.json(); } catch { throw publicError('JSON de commande invalide.', 400); }
}

function publicSiteOrigin(env) {
  try { return new URL(env.PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN).origin; } catch { return DEFAULT_SITE_ORIGIN; }
}

async function loadSiteData(origin) {
  const [settings, menus, items, delivery] = await Promise.all(['settings.json', 'menus.json', 'items.json', 'delivery.json'].map((file) => fetchPublicJson(origin, `assets/data/${file}`)));
  return { settings, menus, items, delivery };
}

async function fetchPublicJson(origin, path) {
  const response = await fetch(`${origin}/${path}`, { cache: 'no-store' });
  if (!response.ok) throw publicError(`Données publiques indisponibles: ${path}`, 502);
  try { return await response.json(); } catch { throw publicError(`JSON public invalide: ${path}`, 502); }
}

async function loadStripeCatalog(env, origin) {
  if (env.STRIPE_CATALOG_JSON) {
    try { return JSON.parse(env.STRIPE_CATALOG_JSON); } catch { throw publicError('STRIPE_CATALOG_JSON est invalide.', 500); }
  }
  try { const response = await fetch(`${origin}/assets/data/stripe_catalog.json`, { cache: 'no-store' }); return response.ok ? await response.json() : {}; } catch { return {}; }
}

function validateOrder(payload, site, now) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items) || !payload.items.length) throw publicError('Le panier est vide.', 400);
  const ordering = site.settings?.ordering || {};
  if (ordering.enabled === false) throw publicError('Les commandes en ligne sont désactivées.', 400);
  if (!isOrderingOpen(now, ordering)) throw publicError('Les commandes sont actuellement fermées. Elles rouvriront vendredi à 1 h.', 400);

  const menu = site.menus?.current_menu || {};
  if (menu.active === false) throw publicError('Le menu courant n’est pas actif.', 400);
  const activeIds = new Set([...(Array.isArray(menu.item_ids) ? menu.item_ids : []), ...(Array.isArray(menu.extra_ids) ? menu.extra_ids : [])]);
  const items = new Map((Array.isArray(site.items?.items) ? site.items.items : []).map((item) => [String(item.id || ''), item]));
  const customer = normalizeCustomer(payload.customer);
  validateCustomer(customer, site.delivery);
  const deliveryDate = normalizeIsoDate(payload.delivery_date);
  validateDeliveryDate(deliveryDate, site, now);

  let subtotalCents = 0;
  const lines = payload.items.slice(0, 50).map((rawLine) => {
    const itemId = clean(rawLine?.item_id); const portion = clean(rawLine?.portion); const qty = clampInt(rawLine?.qty, 1, 99); const item = items.get(itemId);
    if (!item || !activeIds.has(itemId) || item.available === false) throw publicError('Un article de votre panier n’est plus disponible dans le menu actuel.', 400);
    const price = Number(item.pricing?.[portion]);
    if (!portion || !Number.isFinite(price) || price <= 0) throw publicError(`Format invalide pour ${item.title || itemId}.`, 400);
    const unitAmount = Math.round(price * 100); subtotalCents += unitAmount * qty;
    return { item, itemId, portion, portionLabel: PORTION_LABELS[portion] || portion, qty, unitAmount };
  });
  const minimum = Number(ordering.minimum_order || 0);
  if (subtotalCents < Math.round(minimum * 100)) throw publicError(`Minimum de commande: ${minimum.toFixed(2)} $.`, 400);
  return { lines, subtotalCents, customer, deliveryDate };
}

function isOrderingOpen(now, ordering) {
  const p = zonedParts(now, ordering.timezone || DEFAULT_TIMEZONE);
  const window = ordering.weekly_order_window || {};
  const openDay = WEEKDAYS.indexOf(String(window.open_day || 'friday').toLowerCase());
  const closeDay = WEEKDAYS.indexOf(String(window.close_day || 'wednesday').toLowerCase());
  const openMinute = dayMinute(window.open_time || '01:00'); const closeMinute = dayMinute(window.close_time || '12:00');
  if (openDay < 0 || closeDay < 0 || openMinute === null || closeMinute === null) throw publicError('Configuration de la fenêtre de commande invalide.', 500);
  const current = p.weekday * 1440 + p.hour * 60 + p.minute + p.second / 60;
  const open = openDay * 1440 + openMinute; const close = closeDay * 1440 + closeMinute;
  return open < close ? current >= open && current < close : current >= open || current < close;
}

function validateDeliveryDate(dateIso, site, now) {
  if (!dateIso) throw publicError('Choisissez une date de livraison disponible.', 400);
  const ordering = site.settings?.ordering || {}; const rules = site.delivery?.rules || {};
  const candidate = zonedDateTimestamp(dateIso, rules.delivery_cutoff_time || '13:00', ordering.timezone || DEFAULT_TIMEZONE);
  if (!candidate) throw publicError('Date de livraison invalide.', 400);
  if (candidate.getTime() < now.getTime() + Number(ordering.order_notice_hours || 72) * 3600000) throw publicError('Cette date ne respecte pas le délai minimal de 72 heures.', 400);
  const [year, month, day] = dateIso.split('-').map(Number); const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const deliveryDays = Array.isArray(rules.delivery_days) ? rules.delivery_days : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (!deliveryDays.includes(weekday)) throw publicError('La livraison n’est pas offerte le samedi ni le dimanche.', 400);
  const menu = site.menus?.current_menu || {};
  if ((menu.closed_dates || []).includes(dateIso)) throw publicError('Cette date de livraison est fermée.', 400);
  if ((menu.full_dates || []).includes(dateIso)) throw publicError('Cette date de livraison est complète.', 400);
}

function buildStripeLineItems(lines, catalog, settings) {
  const currency = normalizeCurrency(catalog?.currency || settings?.ordering?.currency || DEFAULT_CURRENCY);
  return lines.map((line) => {
    const catalogPrice = findCatalogPrice(catalog, line.itemId, line.portion);
    if (catalogPrice?.priceId) {
      if (catalogPrice.unitAmount !== null && catalogPrice.unitAmount !== line.unitAmount) throw publicError(`Le catalogue Stripe est désynchronisé pour ${line.item.title || line.itemId}.`, 409);
      return { price: catalogPrice.priceId, quantity: line.qty };
    }
    // Safe fallback: prices still come exclusively from the Worker-fetched item JSON.
    return { quantity: line.qty, price_data: { currency, unit_amount: line.unitAmount, product_data: { name: `${line.item.title || line.itemId} — ${line.portionLabel}`, description: clean(line.item.description) || 'La cuisine de Rosalie' } } };
  });
}

function findCatalogPrice(catalog, itemId, portion) {
  const candidates = [catalog?.items?.[itemId]?.prices?.[portion], catalog?.products?.[itemId]?.prices?.[portion], catalog?.prices?.[itemId]?.[portion], catalog?.prices?.[`${itemId}:${portion}`]];
  for (const value of candidates) { const parsed = parseCatalogPrice(value); if (parsed?.priceId) return parsed; }
  return null;
}
function parseCatalogPrice(value) { if (typeof value === 'string') return { priceId: value, unitAmount: null }; if (!value || typeof value !== 'object') return null; const priceId = clean(value.stripe_price_id || value.price_id || value.price || value.id); return priceId ? { priceId, unitAmount: readUnitAmount(value) } : null; }
function readUnitAmount(value) { const raw = value.unit_amount ?? value.amount_cents ?? value.unit_amount_decimal; return raw === undefined || raw === null || raw === '' || !Number.isFinite(Number(raw)) ? null : Math.round(Number(raw)); }

function validateCustomer(customer, delivery) {
  if (!customer.name) throw publicError('Le nom complet est requis.', 400); if (!customer.phone) throw publicError('Le téléphone est requis.', 400);
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw publicError('Le courriel est invalide.', 400);
  if (!customer.street_number || !customer.street_name || !customer.city) throw publicError('L’adresse de livraison est requise.', 400);
  const cities = (Array.isArray(delivery?.zones) ? delivery.zones : []).filter((zone) => zone.enabled !== false).map((zone) => clean(zone.city).toLowerCase()).filter(Boolean);
  if (cities.length && !cities.includes(customer.city.toLowerCase())) throw publicError('La ville choisie n’est pas dans la zone de livraison.', 400);
}
function normalizeCustomer(customer = {}) { return { name: clean(customer.name), phone: clean(customer.phone), email: clean(customer.email).toLowerCase(), street_number: clean(customer.street_number), street_name: clean(customer.street_name), apartment: clean(customer.apartment), city: clean(customer.city), province: clean(customer.province || 'QC'), postal_code: clean(customer.postal_code).toUpperCase() }; }

function zonedParts(date, timezone) {
  const raw = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return { ...raw, weekday: new Date(Date.UTC(raw.year, raw.month - 1, raw.day)).getUTCDay() };
}
function zonedDateTimestamp(isoDate, time, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate); const minutes = dayMinute(time); if (!match || minutes === null) return null;
  const [year, month, day] = match.slice(1).map(Number); const check = new Date(Date.UTC(year, month - 1, day)); if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const pseudo = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60); const offset = (value) => timezoneOffset(value, timezone); let value = pseudo - offset(pseudo); value = pseudo - offset(value); return new Date(value);
}
function timezoneOffset(timestamp, timezone) { const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(new Date(timestamp)).find((part) => part.type === 'timeZoneName')?.value || 'GMT-0'; const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label); return match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] || 0)) * 60000 : 0; }
function dayMinute(value) { const match = /^(\d{1,2}):(\d{2})$/.exec(String(value)); const hours = Number(match?.[1]); const minutes = Number(match?.[2]); return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null; }

function buildMetadata(orderId, order, site, now) { const p = zonedParts(now, site.settings?.ordering?.timezone || DEFAULT_TIMEZONE); return { order_id: orderId, project: 'rvsite', order_created_at_utc: now.toISOString(), order_created_at_montreal: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`, menu_id: clean(site.menus?.current_menu?.id), delivery_date: order.deliveryDate, ordering_week_opened_at: 'Friday 01:00 America/Toronto', customer_name: order.customer.name, customer_phone: order.customer.phone, delivery_city: order.customer.city, order_summary: order.lines.map((line) => `${line.qty}x ${line.item.title || line.itemId} (${line.portionLabel})`).join('; '), subtotal_cents: String(order.subtotalCents) }; }
function normalizeIsoDate(value) { const text = clean(value); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; }
function normalizeCurrency(value) { const currency = clean(value || DEFAULT_CURRENCY).toLowerCase(); return /^[a-z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY; }
function clampInt(value, min, max) { const number = Math.floor(Number(value)); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min; }
function makeOrderId() { return `rosalie_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`; }
function truncateMetadata(value) { return clean(value).slice(0, 500); }
function clean(value) { return String(value || '').trim(); }
function publicError(message, status = 400) { const error = new Error(message); error.publicMessage = message; error.status = status; return error; }
function json(payload, status, request, env) { return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(request, env) } }); }
function corsHeaders(request, env) { const origin = request.headers.get('Origin') || ''; const configured = String(env.ALLOWED_ORIGIN || '*'); if (configured === '*') return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }; const allowed = configured.split(',').map((value) => value.trim()).filter(Boolean); return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || DEFAULT_SITE_ORIGIN), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }; }
