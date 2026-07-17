/**
 * Stripe Checkout session endpoint skeleton for La cuisine de Rosalie.
 *
 * Deploy as a Netlify/Vercel-style serverless function or adapt the same
 * validation flow for Cloudflare Workers. The browser must send only item IDs,
 * portion keys, quantities, delivery date, and customer details; this function
 * reloads official menu/pricing data before creating the Stripe session.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKEND_DAYS = new Set(['saturday', 'sunday']);

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
}

function normalizeCity(city) {
  return String(city || '').trim().toLocaleLowerCase('fr-CA');
}

function montrealParts(now = new Date()) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])); }

function isOrderingOpen(now = new Date()) { const p = montrealParts(now); const minute = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() * 1440 + p.hour * 60 + p.minute; return minute >= 7260 || minute < 5040; }

function deliveryTimestamp(deliveryDate, deliveryRules) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(deliveryDate || '')); if (!match) return null; const [year, month, day] = match.slice(1).map(Number); const [hour, minute] = String(deliveryRules.delivery_cutoff_time || '13:00').split(':').map(Number); const pseudo = Date.UTC(year, month - 1, day, hour, minute || 0); const offset = (value) => { const label = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' }).formatToParts(new Date(value)).find((part) => part.type === 'timeZoneName')?.value || 'GMT-0'; const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label); return m ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000 : 0; }; let value = pseudo - offset(pseudo); value = pseudo - offset(value); return new Date(value); }

function deliveryReason(deliveryDate, data, now = new Date()) { const candidate = deliveryTimestamp(deliveryDate, data.delivery.rules); if (!candidate) return 'invalid'; if (candidate.getTime() < now.getTime() + Number(data.settings.ordering.order_notice_hours) * 3600000) return 'too_soon'; const weekday = WEEKDAYS[new Date(`${deliveryDate}T12:00:00Z`).getUTCDay()]; if (!(data.delivery.rules.delivery_days || []).includes(weekday)) return 'weekend'; if ((data.menus.current_menu.closed_dates || []).includes(deliveryDate)) return 'closed'; if ((data.menus.current_menu.full_dates || []).includes(deliveryDate)) return 'full'; return 'available'; }

function validateOrder(payload, data) {
  const errors = [];
  const deliveryWindows = Array.isArray(data.delivery.delivery_windows) ? data.delivery.delivery_windows : [];
  const selectedWindows = [payload.delivery_window_1, payload.delivery_window_2].map((window) => String(window || '').trim());
  const itemsById = new Map(data.items.items.map((item) => [item.id, item]));
  const allowedCities = new Set(data.delivery.zones.filter((zone) => zone.enabled !== false).map((zone) => normalizeCity(zone.city)));
  const requestItems = Array.isArray(payload.items) ? payload.items : [];
  const activeIds = new Set([...(data.menus.current_menu.item_ids || []), ...(data.menus.current_menu.extra_ids || [])]);

  if (!requestItems.length) errors.push('Le panier est vide.');
  if (!payload.customer?.name || !payload.customer?.phone) errors.push('Le nom et le téléphone sont requis.');
  if (!allowedCities.has(normalizeCity(payload.customer?.city))) errors.push('Ville de livraison non autorisée.');
  if (data.menus.current_menu.active === false || !isOrderingOpen()) errors.push('Les commandes sont actuellement fermées. Elles rouvriront vendredi à 1 h.');
  const dateReason = deliveryReason(payload.delivery_date, data);
  if (dateReason !== 'available') errors.push(dateReason === 'too_soon' ? 'Cette date ne respecte pas le délai minimal de 72 heures.' : dateReason === 'weekend' ? 'La livraison n’est pas offerte le samedi ni le dimanche.' : dateReason === 'full' ? 'Cette date de livraison est complète.' : 'Date de livraison non disponible.');
  if (!selectedWindows[0] || !selectedWindows[1]) errors.push('Deux plages horaires de livraison sont requises.');
  else if (selectedWindows[0] === selectedWindows[1]) errors.push('Les deux plages horaires de livraison doivent être différentes.');
  else if (deliveryWindows.length && selectedWindows.some((window) => !deliveryWindows.includes(window))) errors.push('Plage horaire de livraison invalide.');

  const lineItems = [];
  let subtotal = 0;
  for (const line of requestItems) {
    const item = itemsById.get(line.item_id);
    const qty = Number(line.qty);
    if (!activeIds.has(line.item_id) || !item || item.available === false) {
      errors.push(`Item indisponible: ${line.item_id}`);
      continue;
    }
    const price = Number(item.pricing?.[line.portion]);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push(`Portion invalide: ${line.item_id}/${line.portion}`);
      continue;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      errors.push(`Quantité invalide: ${line.item_id}`);
      continue;
    }
    subtotal += price * qty;
    lineItems.push({
      price_data: {
        currency: (data.settings.ordering?.currency || 'CAD').toLowerCase(),
        product_data: { name: `${item.title} — ${line.portion}` },
        unit_amount: Math.round(price * 100),
      },
      quantity: qty,
    });
  }

  const minimum = Number(data.settings.ordering?.minimum_order || data.delivery.rules?.minimum_order || 0);
  if (subtotal < minimum) errors.push(`Minimum de commande non atteint (${minimum} $).`);
  return { errors, lineItems, subtotal, selectedWindows };
}

function stripeMetadata(payload, subtotal, selectedWindows) {
  const now = new Date(); const montreal = montrealParts(now);
  const coolerAvailable = payload.cooler_available ? 'Oui' : 'Non';
  const deliveryInstructions = String(payload.delivery_instructions || '').trim() || 'Aucune';
  return {
    source: 'website',
    order_created_at_utc: now.toISOString(),
    order_created_at_montreal: `${montreal.year}-${String(montreal.month).padStart(2, '0')}-${String(montreal.day).padStart(2, '0')} ${String(montreal.hour).padStart(2, '0')}:${String(montreal.minute).padStart(2, '0')}`,
    menu_id: 'menu-week-2026-07-17',
    ordering_week_opened_at: 'Friday 01:00 America/Toronto',
    customer_name: payload.customer.name,
    phone: payload.customer.phone,
    delivery_date: payload.delivery_date,
    delivery_window_1: selectedWindows[0],
    delivery_window_2: selectedWindows[1],
    delivery_windows: `${selectedWindows[0]} / ${selectedWindows[1]}`,
    cooler_available: coolerAvailable,
    delivery_instructions: deliveryInstructions.slice(0, 500),
    city: payload.customer.city,
    subtotal: String(subtotal),
    order_summary: payload.items.map((line) => `${line.qty}x ${line.item_id}/${line.portion}`).join(', ').slice(0, 500),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non permise.' }) };
  if (!process.env.STRIPE_SECRET_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY manquant côté serveur.' }) };

  try {
    const payload = JSON.parse(event.body || '{}');
    const data = {
      settings: await readJson('settings.json'),
      menus: await readJson('menus.json'),
      items: await readJson('items.json'),
      delivery: await readJson('delivery.json'),
    };
    const { errors, lineItems, subtotal, selectedWindows } = validateOrder(payload, data);
    if (errors.length) return { statusCode: 400, body: JSON.stringify({ error: errors.join(' ') }) };

    const metadata = stripeMetadata(payload, subtotal, selectedWindows);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${process.env.PUBLIC_SITE_URL || 'https://example.com'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_SITE_URL || 'https://example.com'}/?checkout=cancelled`,
      customer_email: payload.customer.email || undefined,
      metadata,
      payment_intent_data: { metadata },
    });

    return { statusCode: 200, body: JSON.stringify({ checkout_url: session.url }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Impossible de créer la session Stripe.' }) };
  }
};
