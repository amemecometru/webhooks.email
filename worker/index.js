export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === '/api/endpoints' && request.method === 'POST') {
        return await createEndpoint(request, env, corsHeaders);
      }
      if (url.pathname === '/api/endpoints' && request.method === 'GET') {
        return await listEndpoints(request, env, corsHeaders);
      }
      if (url.pathname.match(/^\/api\/endpoints\/([^\/]+)$/) && request.method === 'GET') {
        const id = url.pathname.split('/')[3];
        return await getEndpoint(id, env, corsHeaders);
      }
      if (url.pathname.match(/^\/api\/endpoints\/([^\/]+)\/logs$/) && request.method === 'GET') {
        const id = url.pathname.split('/')[3];
        return await getLogs(id, env, corsHeaders);
      }
      if (url.pathname.startsWith('/hook/')) {
        return await ingestWebhook(request, url, env, corsHeaders);
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }
};

async function createEndpoint(request, env, headers) {
  const body = await request.json();
  const name = body.name || 'default';
  const destinations = body.destinations || [];

  const id = crypto.randomUUID();
  const apiKey = crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO endpoints (id, name, api_key, destinations, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, name, apiKey, JSON.stringify(destinations), now).run();

  return new Response(JSON.stringify({
    id,
    name,
    api_key: apiKey,
    webhook_url: `https://${request.headers.get('host')}/hook/${id}`,
    destinations,
    created_at: now,
  }), { status: 201, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function listEndpoints(request, env, headers) {
  const auth = request.headers.get('Authorization');
  if (!auth) return unauth(headers);

  const { results } = await env.DB.prepare(
    `SELECT id, name, destinations, created_at FROM endpoints WHERE api_key = ?`
  ).bind(auth.replace('Bearer ', '')).all();

  return new Response(JSON.stringify({ endpoints: results }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function getEndpoint(id, env, headers) {
  const row = await env.DB.prepare(
    `SELECT id, name, destinations, created_at FROM endpoints WHERE id = ?`
  ).bind(id).first();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  row.webhook_url = `https://${host()}/hook/${id}`;
  return new Response(JSON.stringify(row), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function getLogs(id, env, headers) {
  const { results } = await env.DB.prepare(
    `SELECT id, method, headers, body, destinations, delivery_status, created_at
     FROM webhooks WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT 100`
  ).bind(id).all();

  return new Response(JSON.stringify({ logs: results }), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function ingestWebhook(request, url, env, headers) {
  const endpointId = url.pathname.replace('/hook/', '');
  const method = request.method;
  const requestHeaders = Object.fromEntries(request.headers.entries());
  const body = await request.text();
  const now = new Date().toISOString();

  const endpoint = await env.DB.prepare(
    `SELECT id, destinations FROM endpoints WHERE id = ?`
  ).bind(endpointId).first();

  if (!endpoint) {
    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  const destinations = JSON.parse(endpoint.destinations || '[]');
  let deliveryStatus = 'pending';

  if (destinations.length > 0) {
    deliveryStatus = 'forwarding';
    for (const dest of destinations) {
      try {
        const resp = await fetch(dest, {
          method: request.method,
          headers: Object.fromEntries(
            [...request.headers.entries()].filter(([k]) =>
              !['host', 'cf-connecting-ip', 'cf-ray', 'cf-worker', 'x-forwarded-for', 'x-real-ip'].includes(k.toLowerCase())
            )
          ),
          body: body || undefined,
        });
        if (!resp.ok) deliveryStatus = 'partial';
      } catch {
        deliveryStatus = 'failed';
      }
    }
  }

  await env.DB.prepare(
    `INSERT INTO webhooks (id, endpoint_id, method, headers, body, destinations, delivery_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), endpointId, method, JSON.stringify(requestHeaders), body, JSON.stringify(destinations), deliveryStatus, now).run();

  if (deliveryStatus === 'failed') {
    return new Response(JSON.stringify({ status: 'received', delivery: 'failed' }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  return new Response(JSON.stringify({
    status: 'received',
    delivery: deliveryStatus === 'forwarding' ? 'forwarded' : 'queued',
    destinations,
  }), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });
}

function unauth(headers) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function host() {
  return typeof globalThis !== 'undefined' ? globalThis.location?.host || 'api.webhooks.email' : 'api.webhooks.email';
}
