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

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
}

function normalizeCity(city) {
  return String(city || '').trim().toLocaleLowerCase('fr-CA');
}

function minimumDeliveryDate(menu, noticeHours) {
  const noticeDays = Math.ceil(Number(noticeHours || 0) / 24);
  const now = new Date();
  const today = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}T00:00:00-04:00`);
  const menuStart = menu.start_date ? new Date(`${menu.start_date}T00:00:00-04:00`) : today;
  const minimum = new Date(Math.max(today.getTime(), menuStart.getTime()));
  minimum.setDate(minimum.getDate() + noticeDays);
  return minimum;
}

function isDeliveryDateAllowed(deliveryDate, settings, menu) {
  const date = new Date(`${deliveryDate}T12:00:00-04:00`);
  if (Number.isNaN(date.getTime())) return false;
  if (menu.active === false) return false;

  const noticeHours = Number(settings.ordering?.order_notice_hours || 48);
  if (date < minimumDeliveryDate(menu, noticeHours)) return false;
  if (menu.start_date && date < new Date(`${menu.start_date}T00:00:00-04:00`)) return false;
  if (Array.isArray(menu.delivery_days) && menu.delivery_days.length && !menu.delivery_days.includes(WEEKDAYS[date.getDay()])) return false;
  if (Array.isArray(menu.full_dates) && menu.full_dates.includes(deliveryDate)) return false;
  if (Array.isArray(menu.closed_dates) && menu.closed_dates.includes(deliveryDate)) return false;
  return true;
}

function validateOrder(payload, data) {
  const errors = [];
  const itemsById = new Map(data.items.items.map((item) => [item.id, item]));
  const allowedCities = new Set(data.delivery.zones.filter((zone) => zone.enabled !== false).map((zone) => normalizeCity(zone.city)));
  const requestItems = Array.isArray(payload.items) ? payload.items : [];

  if (!requestItems.length) errors.push('Le panier est vide.');
  if (!payload.customer?.name || !payload.customer?.phone) errors.push('Le nom et le téléphone sont requis.');
  if (!allowedCities.has(normalizeCity(payload.customer?.city))) errors.push('Ville de livraison non autorisée.');
  if (!isDeliveryDateAllowed(payload.delivery_date, data.settings, data.menus.current_menu)) errors.push('Date de livraison non disponible.');

  const lineItems = [];
  let subtotal = 0;
  for (const line of requestItems) {
    const item = itemsById.get(line.item_id);
    const qty = Number(line.qty);
    if (!item || item.available === false) {
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
  return { errors, lineItems, subtotal };
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
    const { errors, lineItems, subtotal } = validateOrder(payload, data);
    if (errors.length) return { statusCode: 400, body: JSON.stringify({ error: errors.join(' ') }) };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${process.env.PUBLIC_SITE_URL || 'https://example.com'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_SITE_URL || 'https://example.com'}/?checkout=cancelled`,
      customer_email: payload.customer.email || undefined,
      metadata: {
        source: 'website',
        customer_name: payload.customer.name,
        phone: payload.customer.phone,
        delivery_date: payload.delivery_date,
        city: payload.customer.city,
        subtotal: String(subtotal),
        order_summary: payload.items.map((line) => `${line.qty}x ${line.item_id}/${line.portion}`).join(', ').slice(0, 500),
      },
    });

    return { statusCode: 200, body: JSON.stringify({ checkout_url: session.url }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Impossible de créer la session Stripe.' }) };
  }
};
