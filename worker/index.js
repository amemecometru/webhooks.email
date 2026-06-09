const ROUTES = [
  // Webhook ingestion
  { method: 'ALL',   pattern: /^\/hook\/(.+)$/,           handler: 'ingestWebhook' },

  // Endpoints CRUD
  { method: 'POST',  pattern: /^\/api\/endpoints$/,         handler: 'createEndpoint' },
  { method: 'GET',   pattern: /^\/api\/endpoints$/,         handler: 'listEndpoints' },
  { method: 'GET',   pattern: /^\/api\/endpoints\/([^\/]+)$/, handler: 'getEndpoint' },
  { method: 'DELETE',pattern: /^\/api\/endpoints\/([^\/]+)$/, handler: 'deleteEndpoint' },

  // Destinations
  { method: 'POST',  pattern: /^\/api\/endpoints\/([^\/]+)\/destinations$/,      handler: 'addDestination' },
  { method: 'DELETE',pattern: /^\/api\/endpoints\/([^\/]+)\/destinations\/([^\/]+)$/, handler: 'removeDestination' },

  // Email destinations (webhook → email)
  { method: 'POST',  pattern: /^\/api\/endpoints\/([^\/]+)\/email-destinations$/,      handler: 'addEmailDestination' },
  { method: 'DELETE',pattern: /^\/api\/endpoints\/([^\/]+)\/email-destinations\/([^\/]+)$/, handler: 'removeEmailDestination' },

  // Transforms (AI)
  { method: 'GET',   pattern: /^\/api\/endpoints\/([^\/]+)\/transforms$/, handler: 'getTransform' },
  { method: 'PUT',   pattern: /^\/api\/endpoints\/([^\/]+)\/transforms$/, handler: 'setTransform' },
  { method: 'DELETE',pattern: /^\/api\/endpoints\/([^\/]+)\/transforms$/, handler: 'deleteTransform' },

  // Logs
  { method: 'GET',   pattern: /^\/api\/endpoints\/([^\/]+)\/logs$/, handler: 'getLogs' },

  // Usage & Plan
  { method: 'GET',   pattern: /^\/api\/usage$/, handler: 'getUsage' },
  { method: 'GET',   pattern: /^\/api\/plan$/,  handler: 'getPlan' },

  // Dead letter queue
  { method: 'GET',    pattern: /^\/api\/dead-letters$/,          handler: 'listDeadLetters' },
  { method: 'POST',   pattern: /^\/api\/dead-letters\/([^\/]+)\/replay$/, handler: 'replayDeadLetter' },

  // Scheduled webhooks
  { method: 'POST',  pattern: /^\/api\/scheduled-webhooks$/,         handler: 'createScheduledWebhook' },
  { method: 'GET',   pattern: /^\/api\/scheduled-webhooks$/,         handler: 'listScheduledWebhooks' },
  { method: 'DELETE',pattern: /^\/api\/scheduled-webhooks\/([^\/]+)$/, handler: 'deleteScheduledWebhook' },

  // Sandbox (homepage test email)
  { method: 'POST',  pattern: /^\/api\/sandbox\/send-test$/, handler: 'sandboxSendTest' },

  // Stripe
  { method: 'POST',  pattern: /^\/api\/stripe\/checkout$/, handler: 'stripeCheckout' },
  { method: 'POST',  pattern: /^\/api\/stripe\/portal$/,   handler: 'stripePortal' },
  { method: 'POST',  pattern: /^\/api\/stripe\/webhook$/,  handler: 'stripeWebhook' },
];

const PLANS = {
  free:       { endpoints: 1,  webhooks: 1000,   destinations: 2,  retentionDays: 7,  emailDaily: 5,    transforms: false,  dlq: false,  scheduled: false },
  pro:        { endpoints: 10, webhooks: 100000, destinations: Infinity, retentionDays: 30, emailDaily: 500, transforms: true,   dlq: true,   scheduled: true },
  enterprise: { endpoints: Infinity, webhooks: 5000000, destinations: Infinity, retentionDays: 90, emailDaily: Infinity, transforms: true, dlq: true, scheduled: true },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

function unauth() {
  return json({ error: 'Unauthorized' }, 401);
}

async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const apiKey = auth.replace('Bearer ', '');
  const ep = await env.DB.prepare('SELECT id, plan FROM endpoints WHERE api_key = ?').bind(apiKey).first();
  return ep || null;
}

function billingPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function trackUsage(env, endpointId, eventType, quantity = 1) {
  const period = billingPeriod();
  await env.DB.prepare(
    `INSERT INTO usage_events (id, endpoint_id, event_type, quantity, billing_period, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), endpointId, eventType, quantity, period, new Date().toISOString()).run();
}

async function getUsageForPeriod(env, endpointId, eventType, period) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) as total FROM usage_events WHERE endpoint_id = ? AND event_type = ? AND billing_period = ?`
  ).bind(endpointId, eventType, period).first();
  return row ? row.total : 0;
}

async function checkPlanLimit(endpoint, env, type) {
  const plan = PLANS[endpoint.plan] || PLANS.free;
  const period = billingPeriod();
  const used = await getUsageForPeriod(env, endpoint.id, type, period);
  const limit = type === 'webhook_received' ? plan.webhooks :
                type === 'email_sent' ? plan.emailDaily * 30 : Infinity;
  return { allowed: used < limit, used, limit, period };
}

function host(request) {
  return request?.headers?.get('host') || 'api.webhooks.email';
}

function openRouterKey(env, index) {
  const keys = [env.OPENROUTER_KEY_1, env.OPENROUTER_KEY_2, env.OPENROUTER_KEY_3].filter(Boolean);
  return keys[index % keys.length] || keys[0] || '';
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    for (const route of ROUTES) {
      const match = url.pathname.match(route.pattern);
      if (!match) continue;
      if (route.method !== 'ALL' && route.method !== request.method) continue;

      try {
        const handler = this[route.handler];
        if (!handler) return error('Handler not found', 500);
        return await handler.call(this, request, env, match);
      } catch (err) {
        return error(err.message, 500);
      }
    }

    return error('Not found', 404);
  },

  /* ── Endpoints ── */

  async createEndpoint(request, env, match) {
    const body = await request.json();
    const name = body.name || 'default';
    const destinations = body.destinations || [];

    const id = crypto.randomUUID();
    const apiKey = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO endpoints (id, name, api_key, destinations, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, name, apiKey, JSON.stringify(destinations), now).run();

    return json({
      id, name, api_key: apiKey,
      webhook_url: `https://${host(request)}/hook/${id}`,
      destinations, created_at: now, plan: 'free',
    }, 201);
  },

  async listEndpoints(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const { results } = await env.DB.prepare(
      `SELECT id, name, destinations, plan, created_at FROM endpoints WHERE api_key = ?`
    ).bind(request.headers.get('Authorization').replace('Bearer ', '')).all();

    for (const e of results) {
      e.webhook_url = `https://${host(request)}/hook/${e.id}`;
      const period = billingPeriod();
      const usage = await getUsageForPeriod(env, e.id, 'webhook_received', period);
      e.webhook_count = usage;
    }

    return json({ endpoints: results });
  },

  async getEndpoint(request, env, match) {
    const id = match[1];
    const row = await env.DB.prepare(
      `SELECT id, name, destinations, plan, email_to, created_at FROM endpoints WHERE id = ?`
    ).bind(id).first();
    if (!row) return error('Not found', 404);

    row.webhook_url = `https://${host(request)}/hook/${id}`;
    row.destinations = JSON.parse(row.destinations || '[]');

    return json(row);
  },

  async deleteEndpoint(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    await env.DB.prepare('DELETE FROM usage_events WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM dead_letters WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM email_destinations WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM transforms WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM scheduled_webhooks WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM webhooks WHERE endpoint_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM endpoints WHERE id = ? AND api_key = ?').bind(id, request.headers.get('Authorization').replace('Bearer ', '')).run();

    return json({ status: 'deleted' });
  },

  /* ── Destinations ── */

  async addDestination(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    const body = await request.json();
    const url = body.url;
    if (!url) return error('url is required');

    const row = await env.DB.prepare(
      `SELECT destinations FROM endpoints WHERE id = ?`
    ).bind(id).first();
    const destinations = JSON.parse(row.destinations || '[]');
    const plan = PLANS[ep.plan] || PLANS.free;
    if (destinations.length >= plan.destinations) {
      return error(`Plan limit reached: max ${plan.destinations === Infinity ? 'unlimited' : plan.destinations} destinations`);
    }

    const destId = crypto.randomUUID();
    destinations.push({ id: destId, url });
    await env.DB.prepare(`UPDATE endpoints SET destinations = ? WHERE id = ?`)
      .bind(JSON.stringify(destinations), id).run();

    return json({ id: destId, url }, 201);
  },

  async removeDestination(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1], destId = match[2];
    if (ep.id !== id) return error('Forbidden', 403);

    const row = await env.DB.prepare(`SELECT destinations FROM endpoints WHERE id = ?`).bind(id).first();
    const destinations = JSON.parse(row.destinations || '[]').filter(d => d.id !== destId);
    await env.DB.prepare(`UPDATE endpoints SET destinations = ? WHERE id = ?`)
      .bind(JSON.stringify(destinations), id).run();

    return json({ status: 'removed' });
  },

  /* ── Email Destinations (webhook → email) ── */

  async addEmailDestination(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    const body = await request.json();
    const email = body.email;
    if (!email) return error('email is required');

    const plan = PLANS[ep.plan] || PLANS.free;
    const { results: existing } = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM email_destinations WHERE endpoint_id = ?`
    ).bind(id).all();
    if (existing[0]?.cnt >= plan.emailDaily && plan.emailDaily !== Infinity) {
      return error('Plan email destination limit reached');
    }

    const destId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO email_destinations (id, endpoint_id, email, subject_template, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(destId, id, email, body.subject_template || null, new Date().toISOString()).run();

    await env.DB.prepare(`UPDATE endpoints SET email_to = ? WHERE id = ?`).bind(email, id).run();

    return json({ id: destId, email }, 201);
  },

  async removeEmailDestination(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1], destId = match[2];
    if (ep.id !== id) return error('Forbidden', 403);

    await env.DB.prepare(`DELETE FROM email_destinations WHERE id = ? AND endpoint_id = ?`).bind(destId, id).run();

    const { results: remaining } = await env.DB.prepare(
      `SELECT email FROM email_destinations WHERE endpoint_id = ? LIMIT 1`
    ).bind(id).all();
    await env.DB.prepare(`UPDATE endpoints SET email_to = ? WHERE id = ?`)
      .bind(remaining[0]?.email || null, id).run();

    return json({ status: 'removed' });
  },

  /* ── AI Transforms ── */

  async getTransform(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    const row = await env.DB.prepare(
      `SELECT id, prompt, output_schema, model, enabled, created_at FROM transforms WHERE endpoint_id = ?`
    ).bind(id).first();

    return json({ transform: row || null });
  },

  async setTransform(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    const plan = PLANS[ep.plan] || PLANS.free;
    if (!plan.transforms) return error('Transforms require Pro plan or higher');

    const body = await request.json();
    if (!body.prompt) return error('prompt is required');

    const existing = await env.DB.prepare(
      `SELECT id FROM transforms WHERE endpoint_id = ?`
    ).bind(id).first();

    if (existing) {
      await env.DB.prepare(
        `UPDATE transforms SET prompt = ?, output_schema = ?, model = ?, enabled = ? WHERE endpoint_id = ?`
      ).bind(body.prompt, body.output_schema || null, body.model || 'openai/gpt-4o-mini', body.enabled !== false ? 1 : 0, id).run();
      return json({ status: 'updated' });
    }

    const txId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO transforms (id, endpoint_id, prompt, output_schema, model, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(txId, id, body.prompt, body.output_schema || null, body.model || 'openai/gpt-4o-mini', 1, new Date().toISOString()).run();

    return json({ id: txId, status: 'created' }, 201);
  },

  async deleteTransform(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];
    if (ep.id !== id) return error('Forbidden', 403);

    await env.DB.prepare(`DELETE FROM transforms WHERE endpoint_id = ?`).bind(id).run();
    return json({ status: 'deleted' });
  },

  /* ── Logs ── */

  async getLogs(request, env, match) {
    const id = match[1];
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = url.searchParams.get('search');

    let query = `SELECT id, method, headers, body, destinations, delivery_status, created_at
                 FROM webhooks WHERE endpoint_id = ?`;
    const params = [id];

    if (search) {
      query += ` AND (body LIKE ? OR headers LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ logs: results });
  },

  /* ── Usage & Plan ── */

  async getUsage(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const period = billingPeriod();
    const webhooksReceived = await getUsageForPeriod(env, ep.id, 'webhook_received', period);
    const emailsSent = await getUsageForPeriod(env, ep.id, 'email_sent', period);
    const transformsRun = await getUsageForPeriod(env, ep.id, 'transform_run', period);
    const webhooksForwarded = await getUsageForPeriod(env, ep.id, 'webhook_forwarded', period);

    return json({
      total: webhooksReceived,
      webhooks_received: webhooksReceived,
      emails_sent: emailsSent,
      transforms_run: transformsRun,
      webhooks_forwarded: webhooksForwarded,
      period,
      plan: ep.plan,
    });
  },

  async getPlan(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const plan = PLANS[ep.plan] || PLANS.free;
    const period = billingPeriod();
    const used = await getUsageForPeriod(env, ep.id, 'webhook_received', period);

    return json({
      plan: ep.plan,
      period,
      endpoints_limit: plan.endpoints,
      webhooks_limit: plan.webhooks,
      destinations_limit: plan.destinations,
      retention_days: plan.retentionDays,
      email_daily_limit: plan.emailDaily,
      features: {
        transforms: plan.transforms,
        dead_letter_queue: plan.dlq,
        scheduled_webhooks: plan.scheduled,
      },
      usage: {
        webhooks_received: used,
        remaining: Math.max(0, plan.webhooks - used),
      },
    });
  },

  /* ── Dead Letter Queue ── */

  async listDeadLetters(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

    const { results } = await env.DB.prepare(
      `SELECT id, endpoint_id, destination_url, method, error, retry_count, max_retries, created_at
       FROM dead_letters WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(ep.id, limit).all();

    return json({ dead_letters: results });
  },

  async replayDeadLetter(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const dlId = match[1];

    const dl = await env.DB.prepare(
      `SELECT * FROM dead_letters WHERE id = ? AND endpoint_id = ?`
    ).bind(dlId, ep.id).first();
    if (!dl) return error('Dead letter not found', 404);

    try {
      const resp = await fetch(dl.destination_url, {
        method: dl.method,
        headers: JSON.parse(dl.headers || '{}'),
        body: dl.body || undefined,
      });

      const now = new Date().toISOString();
      if (resp.ok) {
        await env.DB.prepare(`DELETE FROM dead_letters WHERE id = ?`).bind(dlId).run();
        return json({ status: 'delivered', status_code: resp.status });
      }

      const retryCount = dl.retry_count + 1;
      const nextRetry = retryCount < dl.max_retries
        ? new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString()
        : null;

      await env.DB.prepare(
        `UPDATE dead_letters SET retry_count = ?, next_retry_at = ?, error = ?, status_code = ? WHERE id = ?`
      ).bind(retryCount, nextRetry, `HTTP ${resp.status}`, resp.status, dlId).run();

      return json({ status: 'retry_queued', retry_count: retryCount, next_retry_at: nextRetry });
    } catch (err) {
      const retryCount = dl.retry_count + 1;
      const nextRetry = retryCount < dl.max_retries
        ? new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString()
        : null;

      await env.DB.prepare(
        `UPDATE dead_letters SET retry_count = ?, next_retry_at = ?, error = ? WHERE id = ?`
      ).bind(retryCount, nextRetry, err.message, dlId).run();

      return json({ status: 'retry_queued', retry_count: retryCount, next_retry_at: nextRetry });
    }
  },

  /* ── Scheduled Webhooks ── */

  async createScheduledWebhook(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const plan = PLANS[ep.plan] || PLANS.free;
    if (!plan.scheduled) return error('Scheduled webhooks require Pro plan or higher');

    const body = await request.json();
    if (!body.cron || !body.url) return error('cron and url are required');

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO scheduled_webhooks (id, endpoint_id, cron, method, url, headers, body, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, ep.id, body.cron, body.method || 'POST', body.url, JSON.stringify(body.headers || {}), body.body || '', body.enabled !== false ? 1 : 0, new Date().toISOString()).run();

    return json({ id, status: 'created' }, 201);
  },

  async listScheduledWebhooks(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    const { results } = await env.DB.prepare(
      `SELECT id, cron, method, url, enabled, created_at FROM scheduled_webhooks WHERE endpoint_id = ? ORDER BY created_at DESC`
    ).bind(ep.id).all();

    return json({ scheduled_webhooks: results });
  },

  async deleteScheduledWebhook(request, env, match) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();
    const id = match[1];

    await env.DB.prepare(`DELETE FROM scheduled_webhooks WHERE id = ? AND endpoint_id = ?`).bind(id, ep.id).run();
    return json({ status: 'deleted' });
  },

  /* ── Stripe Billing ── */

  async stripeCheckout(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    if (!env.STRIPE_SECRET_KEY) return error('Stripe not configured', 501);

    const body = await request.json();
    const priceId = body.price_id;
    const successUrl = body.success_url || 'https://app.webhooks.email/#dashboard';
    const cancelUrl = body.cancel_url || 'https://app.webhooks.email/#settings';

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'client_reference_id': ep.id,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'metadata[endpoint_id]': ep.id,
        'metadata[plan]': body.plan || 'pro',
      }).toString(),
    });

    const session = await stripeResp.json();
    if (!stripeResp.ok) return error(session.error?.message || 'Stripe error', 400);

    return json({ url: session.url, session_id: session.id });
  },

  async stripePortal(request, env) {
    const ep = await requireAuth(request, env);
    if (!ep) return unauth();

    if (!env.STRIPE_SECRET_KEY) return error('Stripe not configured', 501);

    const row = await env.DB.prepare(
      `SELECT stripe_customer_id FROM endpoints WHERE id = ?`
    ).bind(ep.id).first();

    if (!row?.stripe_customer_id) return error('No customer found; subscribe first', 404);

    const returnUrl = 'https://app.webhooks.email/#settings';
    const portalResp = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': row.stripe_customer_id,
        'return_url': returnUrl,
      }).toString(),
    });

    const session = await portalResp.json();
    if (!portalResp.ok) return error(session.error?.message || 'Stripe error', 400);

    return json({ url: session.url });
  },

  async stripeWebhook(request, env) {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return error('Stripe not configured', 501);

    const signature = request.headers.get('stripe-signature');
    const body = await request.text();

    const verifyResp = await fetch('https://api.stripe.com/v1/webhook_endpoints/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: body,
        signature,
        secret: env.STRIPE_WEBHOOK_SECRET,
      }),
    });

    if (!verifyResp.ok) return error('Invalid signature', 401);

    const event = JSON.parse(body);
    const handler = {
      'checkout.session.completed': async (session) => {
        const endpointId = session.client_reference_id || session.metadata?.endpoint_id;
        const plan = session.metadata?.plan || 'pro';
        if (endpointId) {
          await env.DB.prepare(
            `UPDATE endpoints SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`
          ).bind(plan, session.customer, session.subscription, endpointId).run();
        }
      },
      'customer.subscription.updated': async (sub) => {
        const customerId = sub.customer;
        const row = await env.DB.prepare(
          `SELECT id FROM endpoints WHERE stripe_customer_id = ?`
        ).bind(customerId).first();
        if (row) {
          const status = sub.status;
          const plan = status === 'active' || status === 'trialing' ? (sub.items?.data?.[0]?.price?.metadata?.plan || 'pro') : 'free';
          await env.DB.prepare(`UPDATE endpoints SET plan = ? WHERE id = ?`).bind(plan, row.id).run();
        }
      },
      'customer.subscription.deleted': async (sub) => {
        const customerId = sub.customer;
        const row = await env.DB.prepare(
          `SELECT id FROM endpoints WHERE stripe_customer_id = ?`
        ).bind(customerId).first();
        if (row) {
          await env.DB.prepare(`UPDATE endpoints SET plan = 'free', stripe_subscription_id = NULL WHERE id = ?`).bind(row.id).run();
        }
      },
      'invoice.paid': async (invoice) => {
        const { results } = await env.DB.prepare(
          `SELECT id, endpoint_id FROM outcomes WHERE identifier = ? AND status = 'pending'`
        ).bind(invoice.id).all();
        for (const o of results) {
          await env.DB.prepare(`UPDATE outcomes SET status = 'sent' WHERE id = ?`).bind(o.id).run();
        }
      },
    };

    const h = handler[event.type];
    if (h) await h(event.data.object);

    return json({ received: true });
  },

  /* ── Sandbox (homepage test email) ── */

  async sandboxSendTest(request, env) {
    if (!env.EMAIL_API_KEY) return error('Email service not configured', 501);

    const body = await request.json();
    const email = body.email;
    const html = body.html || '';
    const text = body.text || '';

    if (!email || !email.includes('@')) return error('A valid email address is required');
    if (!html && !text) return error('HTML or text content is required');

    try {
      const subject = body.subject || 'Your Test Email from webhooks.email';

      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: env.EMAIL_FROM || 'noreply@webhooks.email', name: 'webhooks.email Sandbox' },
          subject,
          content: [
            { type: 'text/plain', value: text || 'HTML email — view in an HTML-capable email client.' },
            { type: 'text/html', value: html || `<pre>${text.replace(/</g, '&lt;')}</pre>` },
          ],
        }),
      });

      return json({ status: 'sent', email, message: 'Test email sent! Check your inbox.' });
    } catch (err) {
      return error('Failed to send: ' + err.message, 500);
    }
  },

  /* ── Webhook Ingestion (core) ── */

  async ingestWebhook(request, env, match) {
    const endpointId = match[1];
    const method = request.method;
    const requestHeaders = Object.fromEntries(request.headers.entries());
    const body = await request.text();
    const now = new Date().toISOString();

    const endpoint = await env.DB.prepare(
      `SELECT id, destinations, plan, email_to FROM endpoints WHERE id = ?`
    ).bind(endpointId).first();

    if (!endpoint) return error('Endpoint not found', 404);

    const plan = PLANS[endpoint.plan] || PLANS.free;
    const limitCheck = await checkPlanLimit(endpoint, env, 'webhook_received');
    if (!limitCheck.allowed) {
      return error(`Plan limit reached: ${limitCheck.used}/${limitCheck.limit} webhooks this period. Upgrade at https://app.webhooks.email`, 402);
    }

    const webhookId = crypto.randomUUID();
    const destinations = JSON.parse(endpoint.destinations || '[]');
    let deliveryStatus = 'pending';

    // Run AI transform if configured
    let transformedBody = body;
    let transformedHeaders = { ...requestHeaders };

    const transformConfig = await env.DB.prepare(
      `SELECT prompt, model FROM transforms WHERE endpoint_id = ? AND enabled = 1`
    ).bind(endpointId).first();

    if (transformConfig) {
      try {
        const result = await this.runTransform(env, endpoint, body, transformConfig);
        if (result) {
          transformedBody = result.body;
          transformedHeaders = { ...transformedHeaders, 'x-webhook-transformed': 'true', 'x-webhook-model': transformConfig.model };
        }
        await trackUsage(env, endpointId, 'transform_run');
      } catch (err) {
        transformedHeaders['x-webhook-transform-error'] = err.message;
      }
    }

    if (destinations.length > 0) {
      deliveryStatus = 'forwarding';
      const destList = destinations;

      for (const dest of destList) {
        try {
          const resp = await fetch(dest.url || dest, {
            method,
            headers: Object.fromEntries(
              Object.entries(transformedHeaders).filter(([k]) =>
                !['host', 'cf-connecting-ip', 'cf-ray', 'cf-worker', 'x-forwarded-for', 'x-real-ip'].includes(k.toLowerCase())
              )
            ),
            body: transformedBody || undefined,
          });
          await trackUsage(env, endpointId, 'webhook_forwarded');
          if (!resp.ok) {
            deliveryStatus = 'partial';
            await this.captureDeadLetter(env, endpointId, webhookId, dest.url || dest, method, transformedBody, transformedHeaders, `HTTP ${resp.status}`, resp.status);
          }
        } catch (err) {
          deliveryStatus = 'failed';
          await this.captureDeadLetter(env, endpointId, webhookId, dest.url || dest, method, transformedBody, transformedHeaders, err.message);
        }
      }
    }

    // Forward to email destinations
    const emailDests = await env.DB.prepare(
      `SELECT id, email, subject_template FROM email_destinations WHERE endpoint_id = ?`
    ).bind(endpointId).all();

    if (emailDests.results?.length > 0 && env.EMAIL_API_KEY) {
      const emailLimit = await checkPlanLimit(endpoint, env, 'email_sent');
      for (const ed of emailDests.results) {
        if (!emailLimit.allowed) break;
        try {
          await this.sendEmail(env, ed.email, endpoint, method, body, ed.subject_template);
          await trackUsage(env, endpointId, 'email_sent');
        } catch (err) {
          console.error('email send failed:', err.message);
        }
      }
    }

    await env.DB.prepare(
      `INSERT INTO webhooks (id, endpoint_id, method, headers, body, destinations, delivery_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(webhookId, endpointId, method, JSON.stringify(requestHeaders), body,
      JSON.stringify(destinations.map(d => d.url || d)), deliveryStatus, now).run();

    await trackUsage(env, endpointId, 'webhook_received');

    if (deliveryStatus === 'failed') {
      return json({ status: 'received', delivery: 'failed' }, 502);
    }

    return json({
      status: 'received',
      delivery: deliveryStatus === 'forwarding' ? 'forwarded' : 'queued',
      transformed: !!transformConfig,
      destinations: destinations.map(d => d.url || d),
    });
  },

  /* ── AI Transform (OpenRouter) ── */

  async runTransform(env, endpoint, body, config) {
    if (!env.OPENROUTER_KEY_1 && !env.OPENROUTER_KEY_2 && !env.OPENROUTER_KEY_3) {
      throw new Error('OpenRouter not configured (set OPENROUTER_KEY_1/2/3 secrets)');
    }

    const keyIndex = Math.floor(Math.random() * 3);
    const apiKey = openRouterKey(env, keyIndex);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://webhooks.email',
        'X-Title': 'webhooks.email',
      },
      body: JSON.stringify({
        model: config.model || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a webhook payload transformer. Transform the incoming webhook according to this instruction: ${config.prompt}\n\nRespond with ONLY the transformed JSON payload. No markdown, no explanation, no code blocks. Return valid JSON.`,
          },
          {
            role: 'user',
            content: `Transform this webhook payload:\n\n${body}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter error (key ${keyIndex + 1}): ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const clean = content.replace(/^```(?:json)?\s*([\s\S]*?)```$/m, '$1').trim();

    return { body: clean };
  },

  /* ── Email Sending (SendGrid) ── */

  async sendEmail(env, to, endpoint, method, body, subjectTemplate) {
    if (!env.EMAIL_API_KEY) return;

    const subject = subjectTemplate
      ? subjectTemplate.replace(/\{\{method\}\}/g, method).replace(/\{\{date\}\}/g, new Date().toISOString())
      : `[webhooks.email] ${method} webhook received`;

    const emailBody = typeof body === 'string' && body.startsWith('{')
      ? JSON.stringify(JSON.parse(body), null, 2)
      : body;

    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.EMAIL_FROM || 'noreply@webhooks.email' },
        subject,
        content: [
          { type: 'text/plain', value: `Webhook received at ${endpoint.id}\n\nMethod: ${method}\n\nPayload:\n${emailBody}` },
          { type: 'text/html', value: `<pre style="font-family:monospace;background:#f5f5f5;padding:16px;border-radius:4px;font-size:14px;line-height:1.5">Webhook received at <strong>${endpoint.id}</strong><br><br>Method: ${method}<br><br>Payload:<br>${emailBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` },
        ],
      }),
    });
  },

  /* ── Dead Letter Capture ── */

  async captureDeadLetter(env, endpointId, webhookId, destUrl, method, body, headers, error, statusCode) {
    const planRow = await env.DB.prepare(`SELECT plan FROM endpoints WHERE id = ?`).bind(endpointId).first();
    const plan = PLANS[planRow?.plan || 'free'] || PLANS.free;
    if (!plan.dlq) return;

    const now = new Date().toISOString();
    const maxRetries = planRow?.plan === 'enterprise' ? 5 : 3;
    const nextRetry = new Date(Date.now() + 60000).toISOString();

    await env.DB.prepare(
      `INSERT INTO dead_letters (id, endpoint_id, webhook_id, destination_url, method, headers, body, error, status_code, retry_count, max_retries, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), endpointId, webhookId, destUrl, method,
      JSON.stringify(headers), body, error, statusCode || null, 0, maxRetries, nextRetry, now).run();
  },

  /* ── Cron Trigger for scheduled webhooks & DLQ retry ── */

  async scheduled(event, env) {
    const minutes = Math.floor(Date.now() / 60000);

    // Retry dead letters due for retry
    const now = new Date().toISOString();
    const { results: dueRetries } = await env.DB.prepare(
      `SELECT * FROM dead_letters WHERE next_retry_at IS NOT NULL AND next_retry_at <= ? AND retry_count < max_retries`
    ).bind(now).all();

    for (const dl of dueRetries) {
      try {
        const resp = await fetch(dl.destination_url, {
          method: dl.method,
          headers: JSON.parse(dl.headers || '{}'),
          body: dl.body || undefined,
        });

        if (resp.ok) {
          await env.DB.prepare(`DELETE FROM dead_letters WHERE id = ?`).bind(dl.id).run();
        } else {
          const retryCount = dl.retry_count + 1;
          const nextRetry = retryCount < dl.max_retries
            ? new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString()
            : null;
          await env.DB.prepare(
            `UPDATE dead_letters SET retry_count = ?, next_retry_at = ?, error = ? WHERE id = ?`
          ).bind(retryCount, nextRetry, `HTTP ${resp.status}`, dl.id).run();
        }
      } catch (err) {
        const retryCount = dl.retry_count + 1;
        const nextRetry = retryCount < dl.max_retries
          ? new Date(Date.now() + Math.pow(2, retryCount) * 60000).toISOString()
          : null;
        await env.DB.prepare(
          `UPDATE dead_letters SET retry_count = ?, next_retry_at = ?, error = ? WHERE id = ?`
        ).bind(retryCount, nextRetry, err.message, dl.id).run();
      }
    }

    // Cleanup old webhooks based on plan retention
    const { results: endpoints } = await env.DB.prepare(`SELECT id, plan FROM endpoints`).all();
    for (const ep of endpoints) {
      const plan = PLANS[ep.plan] || PLANS.free;
      const cutoff = new Date(Date.now() - plan.retentionDays * 86400000).toISOString();
      await env.DB.prepare(`DELETE FROM webhooks WHERE endpoint_id = ? AND created_at < ?`).bind(ep.id, cutoff).run();
    }
  },
};
