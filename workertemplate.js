/**
 * CrowdNet RESTAURATION_TOOLKIT - Order Worker Template
 * ----------------------------------------------------
 * Generic Cloudflare Worker for businesses using Stripe Checkout.
 *
 * Runtime responsibilities:
 *   Stripe webhook
 *     -> verify signature
 *     -> retrieve the authoritative Checkout Session
 *     -> retrieve all line items from Stripe
 *     -> normalize the paid order into a stable toolkit format
 *     -> optionally send a confirmation email through Resend
 *     -> optionally report the normalized order/result to Order Manager
 *
 * This Worker intentionally has NO GitHub dependency.
 *
 * REQUIRED SECRETS
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *
 * REQUIRED WHEN EMAIL_ENABLED=true (default)
 *   RESEND_API_KEY
 *
 * REQUIRED EMAIL CONFIG WHEN EMAIL_ENABLED=true
 *   EMAIL_FROM
 *
 * OPTIONAL CONFIG
 *   BUSINESS_NAME
 *   BUSINESS_LOCALE               default: fr-CA
 *   EXPECTED_CURRENCY             e.g. cad (empty = accept Stripe currency)
 *   ACCEPTED_PROJECTS             comma-separated metadata.project allowlist
 *   EMAIL_ENABLED                 true / false, default true
 *   EMAIL_REPLY_TO
 *   EMAIL_TEMPLATE_JSON           JSON object overriding DEFAULT_EMAIL_TEMPLATE
 *   ORDER_MANAGER_ENDPOINT        future Order Manager ingest URL
 *   ORDER_MANAGER_TOKEN           Bearer token for that endpoint
 *   STRIPE_API_VERSION            optional explicit Stripe-Version header
 *   WEBHOOK_TOLERANCE_SECONDS     default 300
 *
 * STRIPE METADATA CONTRACT
 * RESTAURATION_TOOLKIT sites should attach as many of these as available:
 *   order_id, project, business,
 *   customer_name, customer_phone, customer_email,
 *   delivery_date, delivery_window_1, delivery_window_2,
 *   delivery_address, delivery_city,
 *   cooler_available, delivery_instructions,
 *   subtotal_cents, order_summary
 */

const WORKER_NAME = 'crowdnet-restauration-order-worker';
const VERSION = '1.0.0-template';

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const RESEND_API_URL = 'https://api.resend.com/emails';

const DEFAULT_EMAIL_TEMPLATE = Object.freeze({
  subject: 'Confirmation de votre commande',
  headline: 'Merci pour votre commande!',
  intro: 'Votre paiement a été reçu et votre commande est confirmée.',
  delivery_message: 'Nous communiquerons avec vous au besoin concernant la livraison.',
  signature: 'Merci et à bientôt!',
  show_order_summary: true,
  show_delivery_details: true,
  show_payment_details: true,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return healthResponse(env);
    }

    if (request.method !== 'POST' || url.pathname !== '/stripe/webhook') {
      return json({ ok: false, error: 'Not found' }, 404);
    }

    try {
      const config = readConfig(env);
      assertRuntimeConfiguration(env, config);

      // Stripe signature verification MUST use the exact raw request body.
      const rawBody = await request.text();
      const stripeSignature = request.headers.get('Stripe-Signature');

      if (!stripeSignature) {
        return json({ ok: false, error: 'Missing Stripe-Signature header' }, 400);
      }

      const signatureValid = await verifyStripeSignature(
        rawBody,
        stripeSignature,
        env.STRIPE_WEBHOOK_SECRET,
        config.webhookToleranceSeconds,
      );

      if (!signatureValid) {
        return json({ ok: false, error: 'Invalid Stripe signature' }, 400);
      }

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return json({ ok: false, error: 'Invalid JSON payload' }, 400);
      }

      if (!HANDLED_EVENTS.has(event?.type)) {
        return json({
          ok: true,
          received: true,
          ignored: true,
          event_type: event?.type || null,
        });
      }

      const sessionId = clean(event?.data?.object?.id);
      if (!sessionId.startsWith('cs_')) {
        throw permanentError('Stripe event does not contain a Checkout Session ID');
      }

      // Never trust the webhook object as the final source of truth.
      // Re-fetch the session directly from Stripe.
      const session = await retrieveCheckoutSession(sessionId, env, config);

      if (session.payment_status !== 'paid') {
        return json({
          ok: true,
          received: true,
          ignored: true,
          reason: 'checkout_session_not_paid',
          session_id: session.id,
          payment_status: session.payment_status || null,
        });
      }

      enforceBusinessGuards(session, config);

      const lineItems = await retrieveAllCheckoutLineItems(session.id, env, config);
      const order = normalizeOrder({ event, session, lineItems, config });
      const validation = validateStripeOrder(order, config);

      // Email status is returned to the future Order Manager as part of the processing report.
      const emailResult = await processConfirmationEmail({
        order,
        session,
        env,
        config,
      });

      const report = {
        schema: 'crowdnet.order-worker.report.v1',
        worker: {
          name: WORKER_NAME,
          version: VERSION,
        },
        processed_at: new Date().toISOString(),
        stripe_event: {
          id: clean(event.id) || null,
          type: clean(event.type) || null,
          created: event.created || null,
          livemode: event.livemode === true,
        },
        validation,
        email: emailResult,
        order,
      };

      const managerResult = await reportToOrderManager(report, env, config);
      report.order_manager = managerResult;

      return json({
        ok: true,
        received: true,
        processed: true,
        order_id: order.order_id,
        session_id: order.payment.stripe_checkout_session_id,
        payment_status: order.payment.status,
        email: emailResult.status,
        order_manager: managerResult.status,
      });
    } catch (error) {
      console.error('Order Worker failed', {
        error: safeError(error),
        status: error?.status || 500,
      });

      return json(
        {
          ok: false,
          error: safeError(error),
        },
        Number(error?.status) || 500,
      );
    }
  },
};

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

function readConfig(env) {
  return {
    businessName: clean(env.BUSINESS_NAME) || 'Your Business',
    businessLocale: clean(env.BUSINESS_LOCALE) || 'fr-CA',
    expectedCurrency: clean(env.EXPECTED_CURRENCY).toLowerCase(),
    acceptedProjects: csvSet(env.ACCEPTED_PROJECTS),
    emailEnabled: readBoolean(env.EMAIL_ENABLED, true),
    emailFrom: clean(env.EMAIL_FROM),
    emailReplyTo: clean(env.EMAIL_REPLY_TO),
    orderManagerEndpoint: clean(env.ORDER_MANAGER_ENDPOINT),
    orderManagerToken: clean(env.ORDER_MANAGER_TOKEN),
    stripeApiVersion: clean(env.STRIPE_API_VERSION),
    webhookToleranceSeconds: boundedInteger(env.WEBHOOK_TOLERANCE_SECONDS, 300, 30, 3600),
    emailTemplate: loadEmailTemplate(env),
  };
}

function requiredConfiguration(env, config = readConfig(env)) {
  const missing = [];

  if (!clean(env.STRIPE_SECRET_KEY)) missing.push('STRIPE_SECRET_KEY');
  if (!clean(env.STRIPE_WEBHOOK_SECRET)) missing.push('STRIPE_WEBHOOK_SECRET');

  if (config.emailEnabled) {
    if (!clean(env.RESEND_API_KEY)) missing.push('RESEND_API_KEY');
    if (!config.emailFrom) missing.push('EMAIL_FROM');
  }

  if (config.orderManagerEndpoint && !config.orderManagerToken) {
    missing.push('ORDER_MANAGER_TOKEN');
  }

  return missing;
}

function assertRuntimeConfiguration(env, config) {
  const missing = requiredConfiguration(env, config);
  if (missing.length) {
    throw new Error(`Missing Worker configuration: ${missing.join(', ')}`);
  }
}

function healthResponse(env) {
  try {
    const config = readConfig(env);
    const missing = requiredConfiguration(env, config);

    return json({
      ok: missing.length === 0,
      service: WORKER_NAME,
      version: VERSION,
      ready: missing.length === 0,
      email_enabled: config.emailEnabled,
      order_manager_reporting: Boolean(config.orderManagerEndpoint),
      missing_configuration: missing,
    }, missing.length ? 503 : 200);
  } catch (error) {
    return json({
      ok: false,
      service: WORKER_NAME,
      version: VERSION,
      ready: false,
      error: safeError(error),
    }, 503);
  }
}

/* -------------------------------------------------------------------------- */
/* Stripe webhook verification                                                */
/* -------------------------------------------------------------------------- */

export async function verifyStripeSignature(
  payload,
  header,
  secret,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!payload || !header || !secret) return false;

  const parsed = parseStripeSignatureHeader(header);
  if (!Number.isFinite(parsed.timestamp) || !parsed.signatures.length) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${payload}`),
  );

  const expected = bytesToHex(new Uint8Array(digest));
  return parsed.signatures.some((candidate) => constantTimeEqual(expected, candidate));
}

function parseStripeSignatureHeader(header) {
  const parts = String(header).split(',').map((part) => part.trim()).filter(Boolean);
  let timestamp = NaN;
  const signatures = [];

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;

    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);

    if (key === 't') timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }

  return { timestamp, signatures };
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

/* -------------------------------------------------------------------------- */
/* Stripe API                                                                 */
/* -------------------------------------------------------------------------- */

async function retrieveCheckoutSession(sessionId, env, config) {
  const response = await stripeFetch(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    env,
    config,
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw upstreamError(
      `Stripe Checkout Session lookup failed: ${body?.error?.message || response.status}`,
    );
  }

  if (body?.object !== 'checkout.session') {
    throw upstreamError('Stripe returned an unexpected object for Checkout Session lookup');
  }

  return body;
}

async function retrieveAllCheckoutLineItems(sessionId, env, config) {
  const items = [];
  let startingAfter = '';

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams();
    params.set('limit', '100');
    params.append('expand[]', 'data.price.product');
    if (startingAfter) params.set('starting_after', startingAfter);

    const response = await stripeFetch(
      `/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params.toString()}`,
      { method: 'GET' },
      env,
      config,
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw upstreamError(
        `Stripe line-item lookup failed: ${body?.error?.message || response.status}`,
      );
    }

    const pageItems = Array.isArray(body.data) ? body.data : [];
    items.push(...pageItems);

    if (!body.has_more || !pageItems.length) return items;

    startingAfter = clean(pageItems.at(-1)?.id);
    if (!startingAfter) {
      throw upstreamError('Stripe line-item pagination returned has_more without a cursor');
    }
  }

  throw upstreamError('Stripe line-item pagination exceeded the safety limit');
}

async function writeStripeEmailMarker(sessionId, emailResult, env, config) {
  const params = new URLSearchParams();
  params.set('metadata[crowdnet_email_status]', 'sent');
  params.set('metadata[crowdnet_email_id]', clean(emailResult.id).slice(0, 500));
  params.set('metadata[crowdnet_email_sent_at]', clean(emailResult.sent_at).slice(0, 500));
  params.set('metadata[crowdnet_order_worker]', VERSION.slice(0, 500));

  const response = await stripeFetch(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    },
    env,
    config,
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw upstreamError(
      `Stripe email-marker update failed: ${body?.error?.message || response.status}`,
    );
  }

  return body;
}

async function stripeFetch(path, options, env, config) {
  assertRuntimeConfiguration(env, config);

  const headers = new Headers(options?.headers || {});
  headers.set('Authorization', `Bearer ${env.STRIPE_SECRET_KEY}`);
  if (config.stripeApiVersion) headers.set('Stripe-Version', config.stripeApiVersion);

  return fetch(`${STRIPE_API_BASE}${path}`, {
    ...options,
    headers,
  });
}

/* -------------------------------------------------------------------------- */
/* Business/toolkit guards                                                    */
/* -------------------------------------------------------------------------- */

function enforceBusinessGuards(session, config) {
  const project = clean(session?.metadata?.project);

  if (config.acceptedProjects.size && !config.acceptedProjects.has(project)) {
    throw permanentError(
      `Stripe Checkout Session project "${project || '(empty)'}" is not accepted by this Worker`,
    );
  }

  if (
    config.expectedCurrency
    && clean(session.currency).toLowerCase() !== config.expectedCurrency
  ) {
    throw permanentError(
      `Stripe currency "${clean(session.currency)}" does not match expected currency "${config.expectedCurrency}"`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

export function normalizeOrder({ event, session, lineItems, config }) {
  const metadata = session?.metadata || {};
  const customerDetails = session?.customer_details || {};

  const customerEmail = firstNonEmpty(
    customerDetails.email,
    session.customer_email,
    metadata.customer_email,
  ).toLowerCase();

  const customerName = firstNonEmpty(customerDetails.name, metadata.customer_name);
  const customerPhone = firstNonEmpty(customerDetails.phone, metadata.customer_phone);
  const stripeAddress = normalizeStripeAddress(customerDetails.address);
  const metadataAddress = clean(metadata.delivery_address);

  const normalizedItems = lineItems.map(normalizeLineItem);
  const itemTotal = normalizedItems.reduce(
    (sum, item) => sum + numberOrZero(item.amount_total_cents),
    0,
  );

  const orderId = firstNonEmpty(metadata.order_id, session.client_reference_id, session.id);

  return {
    schema: 'crowdnet.restauration.order.v1',
    order_id: orderId,
    source: {
      engine: 'RESTAURATION_TOOLKIT',
      project: clean(metadata.project) || null,
      business: clean(metadata.business) || config.businessName,
      provider: 'stripe',
    },
    status: 'paid',
    created_at: session.created
      ? new Date(Number(session.created) * 1000).toISOString()
      : null,
    paid_at: event?.created
      ? new Date(Number(event.created) * 1000).toISOString()
      : new Date().toISOString(),
    customer: {
      name: customerName || null,
      email: customerEmail || null,
      phone: customerPhone || null,
      address: stripeAddress || metadataAddress || null,
      city: firstNonEmpty(customerDetails?.address?.city, metadata.delivery_city) || null,
    },
    delivery: {
      date: clean(metadata.delivery_date) || null,
      window_1: clean(metadata.delivery_window_1) || null,
      window_2: clean(metadata.delivery_window_2) || null,
      address: metadataAddress || stripeAddress || null,
      city: clean(metadata.delivery_city) || null,
      cooler_available: parseLooseBoolean(metadata.cooler_available),
      instructions: clean(metadata.delivery_instructions) || null,
    },
    items: normalizedItems,
    totals: {
      line_items_total_cents: itemTotal,
      amount_subtotal_cents: nullableNumber(session.amount_subtotal),
      amount_total_cents: nullableNumber(session.amount_total),
      currency: clean(session.currency).toLowerCase() || null,
    },
    payment: {
      status: clean(session.payment_status) || 'paid',
      provider: 'stripe',
      verified: true,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: objectId(session.payment_intent),
      stripe_customer_id: objectId(session.customer),
      stripe_event_id: clean(event?.id) || null,
      livemode: session.livemode === true,
    },
    toolkit_metadata: sanitizeMetadata(metadata),
  };
}

function normalizeLineItem(item) {
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  const product = typeof item?.price?.product === 'object' ? item.price.product : null;

  return {
    stripe_line_item_id: clean(item?.id) || null,
    stripe_price_id: clean(item?.price?.id) || null,
    stripe_product_id: clean(product?.id)
      || (typeof item?.price?.product === 'string' ? clean(item.price.product) : null),
    name: firstNonEmpty(
      item?.description,
      product?.name,
      item?.price?.nickname,
      'Article',
    ),
    description: clean(product?.description) || null,
    quantity,
    unit_amount_cents: nullableNumber(item?.price?.unit_amount),
    amount_subtotal_cents: nullableNumber(item?.amount_subtotal),
    amount_discount_cents: nullableNumber(item?.amount_discount),
    amount_tax_cents: nullableNumber(item?.amount_tax),
    amount_total_cents: nullableNumber(item?.amount_total),
    currency: clean(item?.currency || item?.price?.currency).toLowerCase() || null,
    metadata: sanitizeMetadata({
      ...(product?.metadata || {}),
      ...(item?.price?.metadata || {}),
    }),
  };
}

function validateStripeOrder(order, config) {
  const warnings = [];

  if (!order.payment.verified || order.payment.status !== 'paid') {
    throw permanentError('Order normalization attempted on an unpaid Stripe Session');
  }

  if (!order.items.length) warnings.push('Stripe Checkout Session has no line items');
  if (!order.customer.email) warnings.push('Customer email is missing');

  if (
    order.totals.amount_total_cents !== null
    && order.totals.line_items_total_cents !== order.totals.amount_total_cents
  ) {
    warnings.push(
      'Line-item total differs from Checkout Session amount_total; discounts, taxes, shipping, or other adjustments may explain the difference',
    );
  }

  if (config.expectedCurrency && order.totals.currency !== config.expectedCurrency) {
    throw permanentError('Normalized order currency does not match configured currency');
  }

  return {
    payment_verified: true,
    amount_total_cents: order.totals.amount_total_cents,
    line_items_total_cents: order.totals.line_items_total_cents,
    currency: order.totals.currency,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Confirmation email                                                         */
/* -------------------------------------------------------------------------- */

async function processConfirmationEmail({ order, session, env, config }) {
  if (!config.emailEnabled) {
    return {
      enabled: false,
      status: 'disabled',
      provider: 'resend',
      stripe_marker_written: false,
    };
  }

  if (!order.customer.email) {
    return {
      enabled: true,
      status: 'skipped_missing_recipient',
      provider: 'resend',
      stripe_marker_written: false,
    };
  }

  // Durable cross-retry memory without GitHub or the future Order Manager.
  if (clean(session?.metadata?.crowdnet_email_status) === 'sent') {
    return {
      enabled: true,
      status: 'already_sent',
      provider: 'resend',
      id: clean(session?.metadata?.crowdnet_email_id) || null,
      sent_at: clean(session?.metadata?.crowdnet_email_sent_at) || null,
      stripe_marker_written: true,
    };
  }

  const subject = interpolate(config.emailTemplate.subject, order, config);
  const html = renderConfirmationEmail(order, config.emailTemplate, config);

  const resend = await sendResendEmail(
    {
      from: config.emailFrom,
      to: order.customer.email,
      replyTo: config.emailReplyTo,
      subject,
      html,
      idempotencyKey: `rt-order-confirmation/${order.payment.stripe_checkout_session_id}`,
    },
    env.RESEND_API_KEY,
  );

  const result = {
    enabled: true,
    status: 'sent',
    provider: 'resend',
    id: resend.id,
    sent_at: new Date().toISOString(),
    stripe_marker_written: false,
  };

  // Email is already delivered. Marker failure must not trigger unnecessary duplicate sends.
  try {
    await writeStripeEmailMarker(
      order.payment.stripe_checkout_session_id,
      result,
      env,
      config,
    );
    result.stripe_marker_written = true;
  } catch (error) {
    result.stripe_marker_error = safeError(error);
    console.error('Email sent but Stripe idempotency marker could not be written', {
      order_id: order.order_id,
      session_id: order.payment.stripe_checkout_session_id,
      resend_id: result.id,
      error: result.stripe_marker_error,
    });
  }

  return result;
}

async function sendResendEmail(message, apiKey) {
  const payload = {
    from: message.from,
    to: [message.to],
    subject: message.subject,
    html: message.html,
  };

  if (message.replyTo) payload.reply_to = message.replyTo;

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || !clean(body.id)) {
    throw upstreamError(
      `Resend delivery failed: ${body?.message || body?.name || response.status}`,
    );
  }

  return body;
}

export function renderConfirmationEmail(order, template, config) {
  const firstName = customerFirstName(order.customer.name);
  const total = formatMoney(
    order.totals.amount_total_cents,
    order.totals.currency,
    config.businessLocale,
  );

  const itemRows = order.items.map((item) => {
    const amount = item.amount_total_cents === null
      ? ''
      : formatMoney(
          item.amount_total_cents,
          item.currency || order.totals.currency,
          config.businessLocale,
        );

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #ece7e2">
          <strong>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</strong>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #ece7e2;white-space:nowrap">
          ${escapeHtml(amount)}
        </td>
      </tr>`;
  }).join('');

  let sections = '';

  if (template.show_order_summary) {
    sections += emailSection(
      'COMMANDE',
      `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${itemRows}
        </table>
        <p style="margin:14px 0 0"><strong>No ${escapeHtml(order.order_id)}</strong></p>
      `,
    );
  }

  if (template.show_delivery_details) {
    const deliveryLines = [
      order.delivery.date ? `Date: ${order.delivery.date}` : '',
      order.delivery.window_1 || order.delivery.window_2
        ? `Plages: ${[order.delivery.window_1, order.delivery.window_2].filter(Boolean).join(' / ')}`
        : '',
      order.delivery.address ? `Adresse: ${order.delivery.address}` : '',
      order.delivery.instructions ? `Instructions: ${order.delivery.instructions}` : '',
    ].filter(Boolean);

    if (deliveryLines.length) {
      sections += emailSection(
        'LIVRAISON',
        escapeHtml(deliveryLines.join('\n')).replace(/\n/g, '<br>'),
      );
    }
  }

  if (template.show_payment_details) {
    sections += emailSection(
      'PAIEMENT CONFIRMÉ',
      `<strong>${escapeHtml(total)}</strong><br>Stripe`,
    );
  }

  return `<!doctype html>
<html lang="${escapeHtml(localeLanguage(config.businessLocale))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(interpolate(template.subject, order, config))}</title>
</head>
<body style="margin:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#292725">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden">
          <tr>
            <td style="padding:30px;background:#25372f;color:#ffffff;text-align:center">
              <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase">
                ${escapeHtml(config.businessName)}
              </div>
              <h1 style="margin:12px 0 0;font-size:27px">
                ${escapeHtml(interpolate(template.headline, order, config))}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px">
              <p style="font-size:18px;margin-top:0">
                <strong>${escapeHtml(firstName ? `Merci ${firstName}!` : 'Merci!')}</strong>
              </p>
              <p style="line-height:1.65">
                ${escapeHtml(interpolate(template.intro, order, config))}
              </p>
            </td>
          </tr>
          ${sections}
          <tr>
            <td style="padding:26px 30px;background:#f5f3ef">
              <p style="line-height:1.6">
                ${escapeHtml(interpolate(template.delivery_message, order, config))}
              </p>
              <p style="margin-bottom:0;white-space:pre-line">
                <strong>${escapeHtml(interpolate(template.signature, order, config))}</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function loadEmailTemplate(env) {
  const template = { ...DEFAULT_EMAIL_TEMPLATE };
  const raw = clean(env.EMAIL_TEMPLATE_JSON);

  if (!raw) return template;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('EMAIL_TEMPLATE_JSON is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EMAIL_TEMPLATE_JSON must contain a JSON object');
  }

  for (const key of ['subject', 'headline', 'intro', 'delivery_message', 'signature']) {
    if (typeof parsed[key] === 'string') {
      template[key] = parsed[key].trim().slice(0, key === 'subject' ? 200 : 4000);
    }
  }

  for (const key of ['show_order_summary', 'show_delivery_details', 'show_payment_details']) {
    if (typeof parsed[key] === 'boolean') template[key] = parsed[key];
  }

  return template;
}

function emailSection(title, body) {
  return `
    <tr>
      <td style="padding:22px 30px;border-top:1px solid #ece7e2">
        <div style="font-size:12px;letter-spacing:1.5px;font-weight:bold;color:#5c7468">
          ${escapeHtml(title)}
        </div>
        <div style="margin-top:9px;line-height:1.6">
          ${body}
        </div>
      </td>
    </tr>`;
}

/* -------------------------------------------------------------------------- */
/* Future Order Manager reporting                                             */
/* -------------------------------------------------------------------------- */

async function reportToOrderManager(report, env, config) {
  if (!config.orderManagerEndpoint) {
    return {
      enabled: false,
      status: 'not_configured',
    };
  }

  try {
    const response = await fetch(config.orderManagerEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.orderManagerToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `stripe/${report.order.payment.stripe_checkout_session_id}`,
        'User-Agent': `${WORKER_NAME}/${VERSION}`,
      },
      body: JSON.stringify(report),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw upstreamError(
        `Order Manager report failed: ${body?.error || body?.message || response.status}`,
      );
    }

    return {
      enabled: true,
      status: 'reported',
      response: body,
    };
  } catch (error) {
    // Reporting is deliberately non-blocking in the template.
    // Once Order Manager exists, this policy can be changed to durable retry/queueing.
    console.error('Order Manager reporting failed', {
      order_id: report.order.order_id,
      error: safeError(error),
    });

    return {
      enabled: true,
      status: 'failed',
      error: safeError(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Template interpolation                                                     */
/* -------------------------------------------------------------------------- */

function interpolate(value, order, config) {
  const replacements = {
    business_name: config.businessName,
    customer_name: order.customer.name || '',
    customer_first_name: customerFirstName(order.customer.name),
    order_id: order.order_id,
    total: formatMoney(
      order.totals.amount_total_cents,
      order.totals.currency,
      config.businessLocale,
    ),
    delivery_date: order.delivery.date || '',
    delivery_window_1: order.delivery.window_1 || '',
    delivery_window_2: order.delivery.window_2 || '',
    delivery_address: order.delivery.address || '',
  };

  return String(value ?? '').replace(
    /\{\{([a-z0-9_]+)\}\}/gi,
    (_, key) => replacements[key] ?? '',
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeStripeAddress(address) {
  if (!address || typeof address !== 'object') return '';

  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const output = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = clean(key).slice(0, 100);
    if (!normalizedKey) continue;
    output[normalizedKey] = clean(rawValue).slice(0, 500);
  }
  return output;
}

function formatMoney(cents, currency = 'cad', locale = 'fr-CA') {
  const numeric = Number(cents);
  if (!Number.isFinite(numeric)) return '';

  try {
    return new Intl.NumberFormat(locale || 'fr-CA', {
      style: 'currency',
      currency: String(currency || 'cad').toUpperCase(),
    }).format(numeric / 100);
  } catch {
    return `${(numeric / 100).toFixed(2)} ${String(currency || 'cad').toUpperCase()}`;
  }
}

function customerFirstName(name) {
  return clean(name).split(/\s+/).filter(Boolean)[0] || '';
}

function localeLanguage(locale) {
  return clean(locale).split(/[-_]/)[0] || 'fr';
}

function objectId(value) {
  if (typeof value === 'string') return clean(value) || null;
  if (value && typeof value === 'object') return clean(value.id) || null;
  return null;
}

function parseLooseBoolean(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'oui', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'non', 'off'].includes(normalized)) return false;
  return null;
}

function readBoolean(value, fallback) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function csvSet(value) {
  return new Set(
    clean(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
}

function clean(value) {
  return String(value ?? '').trim();
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function upstreamError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function permanentError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeError(error) {
  return clean(error?.message || error || 'Unknown error').slice(0, 1000);
}
