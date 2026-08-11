/**
 * RVSITE payment confirmation Worker (Cloudflare module Worker).
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, GITHUB_TOKEN
 * Variables: GITHUB_OWNER, GITHUB_ORDER_REPO, GITHUB_ORDER_BRANCH,
 * GITHUB_ORDER_PATH, RVSITE_REPO, RVSITE_BRANCH, EMAIL_TEMPLATE_PATH, EMAIL_FROM
 */

const VERSION = '1.0.0';
const STRIPE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const DEFAULT_TEMPLATE = {
  enabled: true,
  subject: 'Confirmation de votre commande',
  headline: 'Merci pour votre commande!',
  intro: 'Votre paiement a été reçu et votre commande est confirmée.',
  delivery_message: 'Nous communiquerons avec vous au besoin concernant la livraison.',
  signature: 'Merci et à bientôt! — Rosalie',
  show_order_summary: true,
  show_delivery_details: true,
  show_payment_details: true,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'rvsite-payment-events', version: VERSION });
    }
    if (request.method !== 'POST' || url.pathname !== '/stripe/webhook') {
      return json({ error: 'Not found' }, 404);
    }

    try {
      requireCoreConfiguration(env);
      const rawBody = await request.text();
      const signature = request.headers.get('Stripe-Signature');
      if (!signature || !(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
        return json({ error: 'Invalid Stripe signature' }, 400);
      }

      let event;
      try { event = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!STRIPE_EVENTS.has(event.type)) return json({ received: true, ignored: true });

      const sessionId = event?.data?.object?.id;
      if (!sessionId || !String(sessionId).startsWith('cs_')) throw permanent('Stripe event has no Checkout Session ID');
      const session = await retrieveCheckoutSession(sessionId, env.STRIPE_SECRET_KEY);
      if (session.payment_status !== 'paid') {
        return json({ received: true, ignored: true, reason: 'payment_not_paid' });
      }

      const orderId = correlateOrderId(session);
      const paymentResult = await mutateOrders(env, (document) => {
        const order = findOrder(document.data, orderId);
        validateOrderAgainstSession(order, orderId, session);
        const alreadyPaid = order.payment_status === 'paid' && order.payment?.verified === true;
        if (alreadyPaid) validateExistingPayment(order.payment, session);
        else applyPaidState(order, session, event.id);
        return { changed: !alreadyPaid, value: snapshot(order) };
      }, `Confirm Stripe payment for ${orderId}`);

      let order = paymentResult.value;
      if (!customerEmail(order, session)) {
        await recordEmailFailure(env, orderId, 'Customer email is missing');
        return json({ received: true, paid: true, email: 'failed_missing_address' });
      }
      if (order.confirmation_email?.status === 'sent') {
        return json({ received: true, paid: true, email: 'already_sent' });
      }

      const missingEmailConfig = missingEmailConfiguration(env);
      if (missingEmailConfig.length) {
        const message = `Missing email configuration: ${missingEmailConfig.join(', ')}`;
        await recordEmailFailure(env, orderId, message);
        console.error(message, { order_id: orderId });
        return json({ received: true, paid: true, email: 'failed_not_configured' });
      }

      const template = await loadTemplate(env);
      if (!template.enabled) return json({ received: true, paid: true, email: 'disabled' });

      // Persist the attempt before the external call. Resend's deterministic key makes
      // retries safe if the Worker stops between delivery and the final GitHub write.
      const attemptedAt = new Date().toISOString();
      const claim = await mutateOrders(env, (document) => {
        const current = findOrder(document.data, orderId);
        if (current.confirmation_email?.status === 'sent') return { changed: false, value: snapshot(current) };
        current.confirmation_email = {
          ...current.confirmation_email,
          status: 'sending', provider: 'resend', template: 'order_confirmation', last_attempt_at: attemptedAt,
        };
        delete current.confirmation_email.error;
        return { changed: true, value: snapshot(current) };
      }, `Start confirmation email for ${orderId}`);
      order = claim.value;
      if (order.confirmation_email?.status === 'sent') return json({ received: true, paid: true, email: 'already_sent' });

      const rendered = renderConfirmationEmail(order, session, template, env);
      let delivery;
      try {
        delivery = await sendEmail({
          from: env.EMAIL_FROM,
          to: customerEmail(order, session),
          subject: interpolate(template.subject, order),
          html: rendered,
          orderId,
        }, env.RESEND_API_KEY);
      } catch (error) {
        await recordEmailFailure(env, orderId, safeError(error));
        console.error('Confirmation email failed', { order_id: orderId, error: safeError(error) });
        return json({ received: true, paid: true, email: 'failed' });
      }

      // Delivery succeeded. If this write fails, propagate a non-2xx response so
      // Stripe retries. The Resend idempotency key prevents a duplicate delivery;
      // importantly, we never mislabel a delivered message as failed.
      await recordEmailSuccess(env, orderId, delivery.id, attemptedAt);
      return json({ received: true, paid: true, email: 'sent' });
    } catch (error) {
      console.error('Payment webhook failed', { error: safeError(error) });
      return json({ error: safeError(error) }, error.status || 500);
    }
  },
};

export function requireCoreConfiguration(env) {
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_ORDER_REPO'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing Worker configuration: ${missing.join(', ')}`);
}

export function missingEmailConfiguration(env) {
  return ['RESEND_API_KEY', 'EMAIL_FROM'].filter((name) => !env[name]);
}

export async function verifyStripeSignature(payload, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const fields = header.split(',').map((part) => part.trim().split('='));
  const timestamp = Number(fields.find(([key]) => key === 't')?.[1]);
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((candidate) => constantTimeEqual(expected, candidate));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function retrieveCheckoutSession(id, key) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw upstream(`Stripe session lookup failed: ${body?.error?.message || response.status}`);
  return body;
}

function correlateOrderId(session) {
  const metadataId = clean(session?.metadata?.order_id);
  const referenceId = clean(session?.client_reference_id);
  if (metadataId && referenceId && metadataId !== referenceId) throw permanent('Stripe order identifiers conflict');
  const orderId = metadataId || referenceId;
  if (!orderId) throw permanent('Stripe session has no RVSITE order ID');
  return orderId;
}

function findOrder(data, orderId) {
  const orders = Array.isArray(data) ? data : data?.orders;
  if (!Array.isArray(orders)) throw permanent('orders.json must be an array or contain an orders array');
  const matches = orders.filter((order) => clean(order?.order_id) === orderId);
  if (matches.length !== 1) throw permanent(matches.length ? `Duplicate order: ${orderId}` : `Order not found: ${orderId}`);
  return matches[0];
}

export function validateOrderAgainstSession(order, orderId, session) {
  if (clean(order.order_id) !== orderId) throw permanent('RVSITE order ID conflict');
  const storedSession = clean(order.stripe_checkout_session_id || order.payment?.checkout_session_id);
  if (!storedSession || storedSession !== session.id) throw permanent('Stripe Checkout Session ID conflict');
  const expectedAmount = firstInteger(
    order.amount_total_cents,
    order.total_cents,
    order.subtotal_cents,
    order.payment?.amount_total_cents,
    moneyToCents(order.total),
  );
  if (expectedAmount !== null && expectedAmount !== Number(session.amount_total)) throw permanent('Stripe amount conflicts with RVSITE order');
  const expectedCurrency = clean(order.currency || order.payment?.currency).toLowerCase();
  if (expectedCurrency && expectedCurrency !== clean(session.currency).toLowerCase()) throw permanent('Stripe currency conflicts with RVSITE order');
}

function validateExistingPayment(payment, session) {
  if (payment.checkout_session_id !== session.id || Number(payment.amount_total_cents) !== Number(session.amount_total)
      || clean(payment.currency).toLowerCase() !== clean(session.currency).toLowerCase()) {
    throw permanent('Existing verified payment conflicts with Stripe');
  }
}

function applyPaidState(order, session, eventId) {
  order.payment_status = 'paid';
  order.payment = {
    provider: 'stripe', verified: true, verified_at: new Date().toISOString(),
    checkout_session_id: session.id,
    payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    amount_total_cents: Number(session.amount_total), currency: clean(session.currency).toLowerCase(), stripe_event_id: eventId,
  };
  order.confirmation_email ||= { status: 'not_sent' };
}

async function mutateOrders(env, mutation, message) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await readGithubJson(env, orderRepo(env), env.GITHUB_ORDER_PATH || 'orders.json');
    const result = mutation(document);
    if (!result.changed) return result;
    const response = await writeGithubJson(env, orderRepo(env), env.GITHUB_ORDER_PATH || 'orders.json', document.data, document.sha, message);
    if (response.status === 409 || response.status === 422) continue;
    if (!response.ok) throw upstream(`GitHub order write failed (${response.status}): ${await response.text()}`);
    return result;
  }
  throw upstream('GitHub order update conflicted repeatedly');
}

function orderRepo(env) {
  return { owner: env.GITHUB_OWNER, repo: env.GITHUB_ORDER_REPO, branch: env.GITHUB_ORDER_BRANCH || 'main' };
}

async function readGithubJson(env, repo, path) {
  const url = githubReadUrl(repo, path);
  const response = await fetch(url, { headers: githubHeaders(env.GITHUB_TOKEN) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw upstream(`GitHub read failed (${response.status}): ${body.message || path}`, { githubStatus: response.status });
  try { return { data: JSON.parse(decodeBase64(body.content)), sha: body.sha }; }
  catch { throw permanent(`GitHub file is not valid JSON: ${path}`); }
}

async function writeGithubJson(env, repo, path, data, sha, message) {
  return fetch(githubContentsBaseUrl(repo, path), {
    method: 'PUT', headers: { ...githubHeaders(env.GITHUB_TOKEN), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`), sha, branch: repo.branch }),
  });
}

export function githubContentsBaseUrl(repo, path) {
  return `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function githubReadUrl(repo, path) {
  return `${githubContentsBaseUrl(repo, path)}?ref=${encodeURIComponent(repo.branch)}`;
}

function githubHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'rvsite-payment-events' };
}

export async function loadTemplate(env) {
  const repo = { owner: env.GITHUB_OWNER, repo: env.RVSITE_REPO || 'RVSITE', branch: env.RVSITE_BRANCH || 'main' };
  const path = env.EMAIL_TEMPLATE_PATH || 'assets/data/email_templates.json';
  try {
    const document = await readGithubJson(env, repo, path);
    return normalizeTemplate(document.data?.order_confirmation);
  } catch (error) {
    if (error.githubStatus === 404 || error.status === 422) {
      console.warn('Email template unavailable; using safe defaults', { path, error: safeError(error) });
      return normalizeTemplate();
    }
    throw error;
  }
}

export function normalizeTemplate(value) {
  const source = value && typeof value === 'object' ? value : {};
  const template = { ...DEFAULT_TEMPLATE };
  for (const key of ['subject', 'headline', 'intro', 'delivery_message', 'signature']) {
    if (typeof source[key] === 'string') template[key] = source[key].trim().slice(0, key === 'subject' ? 200 : 2000);
  }
  for (const key of ['enabled', 'show_order_summary', 'show_delivery_details', 'show_payment_details']) {
    if (typeof source[key] === 'boolean') template[key] = source[key];
  }
  return template;
}

export function renderConfirmationEmail(order, session, template, env = {}) {
  const name = customerName(order, session) || 'cliente';
  const items = order.items || order.line_items || order.lines || [];
  const itemRows = items.map((item) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(item.qty || item.quantity || 1)} × ${escapeHtml(item.title || item.name || item.item_name || 'Article')}</strong><br><span style="color:#666">${escapeHtml(item.portion_label || item.portion || item.format || '')}</span></td></tr>`).join('');
  const delivery = deliveryDetails(order);
  const total = formatMoney(Number(session.amount_total), session.currency || 'cad');
  const section = (title, body) => `<tr><td style="padding:20px 28px"><div style="font-size:12px;letter-spacing:1.5px;color:#9b4f5f;font-weight:bold">${title}</div><div style="margin-top:8px;line-height:1.6">${body}</div></td></tr>`;
  let sections = '';
  if (template.show_order_summary) sections += section('COMMANDE', `${itemRows ? `<table role="presentation" width="100%">${itemRows}</table>` : ''}<p><strong>No ${escapeHtml(order.order_id)}</strong></p>`);
  if (template.show_delivery_details && delivery) sections += section('LIVRAISON', escapeHtml(delivery).replace(/\n/g, '<br>'));
  if (template.show_payment_details) sections += section('PAIEMENT CONFIRMÉ', `<strong>${escapeHtml(total)}</strong><br>Stripe`);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f8f4f1;font-family:Arial,sans-serif;color:#2f2927"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#9b4f5f;color:white;text-align:center;padding:28px"><div style="font-size:14px;letter-spacing:2px">${escapeHtml(env.BUSINESS_NAME || 'LA CUISINE DE ROSALIE')}</div><h1 style="margin:12px 0 0;font-size:26px">${escapeHtml(interpolate(template.headline, order))}</h1></td></tr><tr><td style="padding:28px"><p style="font-size:18px"><strong>Merci ${escapeHtml(firstName(name))}!</strong></p><p style="line-height:1.6">${escapeHtml(interpolate(template.intro, order))}</p></td></tr>${sections}<tr><td style="padding:24px 28px;background:#f8f4f1"><p>${escapeHtml(interpolate(template.delivery_message, order))}</p><p style="white-space:pre-line"><strong>${escapeHtml(interpolate(template.signature, order))}</strong></p></td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(message, apiKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rvsite-order-confirmation:${message.orderId}` },
    body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) throw upstream(`Resend delivery failed: ${body.message || response.status}`);
  return body;
}

async function recordEmailFailure(env, orderId, error) {
  await mutateOrders(env, (document) => {
    const order = findOrder(document.data, orderId);
    if (order.confirmation_email?.status === 'sent') return { changed: false, value: null };
    order.confirmation_email = { ...order.confirmation_email, status: 'failed', provider: 'resend', template: 'order_confirmation', last_attempt_at: new Date().toISOString(), error: String(error).slice(0, 500) };
    return { changed: true, value: null };
  }, `Record confirmation email failure for ${orderId}`);
}

async function recordEmailSuccess(env, orderId, providerMessageId, attemptedAt) {
  await mutateOrders(env, (document) => {
    const order = findOrder(document.data, orderId);
    if (order.confirmation_email?.status === 'sent') return { changed: false, value: null };
    order.confirmation_email = {
      status: 'sent', sent_at: new Date().toISOString(), provider: 'resend',
      provider_message_id: providerMessageId, template: 'order_confirmation', last_attempt_at: attemptedAt,
    };
    return { changed: true, value: null };
  }, `Record confirmation email for ${orderId}`);
}

function customerEmail(order, session) { return clean(order.customer?.email || order.customer_email || order.email || session.customer_details?.email || session.customer_email); }
function customerName(order, session) { return clean(order.customer?.name || order.customer_name || order.name || session.customer_details?.name); }
export function normalizeDelivery(order) {
  const customer = order.customer || {};
  const delivery = order.delivery || {};
  return {
    date: delivery.date || order.delivery_date || '',
    window1: delivery.window_1 || order.delivery_window_1 || '',
    window2: delivery.window_2 || order.delivery_window_2 || '',
    address: order.delivery_address || [
      customer.street_number,
      customer.street_name,
      customer.apartment,
      customer.city,
      customer.province,
      customer.postal_code,
    ].filter(Boolean).join(' '),
  };
}
function deliveryDetails(order) {
  const delivery = normalizeDelivery(order);
  return [delivery.date, [delivery.window1, delivery.window2].filter(Boolean).join(' / '), delivery.address].filter(Boolean).join('\n');
}
function interpolate(text, order) {
  const name = customerName(order, {}) || '';
  const delivery = normalizeDelivery(order);
  return String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key) => ({
    customer_name: name,
    customer_first_name: firstName(name),
    order_id: order.order_id || '',
    delivery_date: delivery.date,
    delivery_window_1: delivery.window1,
    delivery_window_2: delivery.window2,
    delivery_address: delivery.address,
  }[key] ?? ''));
}
function formatMoney(cents, currency) { return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: clean(currency).toUpperCase() || 'CAD' }).format(cents / 100); }
function firstName(name) { return clean(name).split(/\s+/)[0]; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function firstInteger(...values) { for (const value of values) if (Number.isInteger(value) && value >= 0) return value; return null; }
function moneyToCents(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) : null; }
function snapshot(value) { return JSON.parse(JSON.stringify(value)); }
function safeError(error) { return String(error?.message || 'Internal error').slice(0, 500); }
function permanent(message) { return Object.assign(new Error(message), { status: 422 }); }
function upstream(message, details = {}) { return Object.assign(new Error(message), { status: 502, ...details }); }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function decodeBase64(value) { const bytes = Uint8Array.from(atob(String(value).replace(/\s/g, '')), (character) => character.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function encodeBase64(value) { const bytes = new TextEncoder().encode(value); let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
