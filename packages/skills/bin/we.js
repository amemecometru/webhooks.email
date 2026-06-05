#!/usr/bin/env node
// Webhooks.Email CLI — `we` command
// Manage endpoints, transforms, email bridges, and dead letters from the terminal.

const API_BASE = 'https://app.webhooks.email/api';

function help() {
  console.log(`
  ⚡ we — Webhooks.Email CLI

  USAGE:
    we <command> [options]

  COMMANDS:
    endpoints                  List all endpoints
    endpoints:create <name>    Create a new endpoint
    endpoints:delete <id>      Delete an endpoint
    send <webhook_url>         Send a test webhook (reads from stdin or -d JSON)
    transform:get <id>         Get transform config for an endpoint
    transform:set <id>         Set a transform prompt (reads from stdin or -p)
    usage                      Show current billing usage
    help                       Show this help

  ENV:
    WE_API_KEY                 Your Webhooks.Email API key

  EXAMPLES:
    export WE_API_KEY=sk_xxx
    we endpoints
    we endpoints:create my-project
    we send https://you.webhooks.email/hook/abc-123 -d '{"event":"test"}'
    we transform:set abc-123 -p 'Extract only the id and status fields'
    we usage

  INSTALL SKILLS:
    npx skills add @webhooks.email/skills --skill webhook-ingestion
    npx skills add @webhooks.email/skills --skill email-bridge
    npx skills add @webhooks.email/skills --skill ai-transform
    npx skills add @webhooks.email/skills --skill dead-letter-queue
    npx skills add @webhooks.email/skills --skill scheduled-webhooks
`);
}

function getApiKey() {
  const key = process.env.WE_API_KEY;
  if (!key) {
    console.error('Error: WE_API_KEY not set. Set it: export WE_API_KEY=sk_xxx');
    process.exit(1);
  }
  return key;
}

async function api(path, options = {}) {
  const key = getApiKey();
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${key}`, ...(options.headers || {}) },
    ...options,
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error(`Error: ${data.error || resp.statusText}`);
    process.exit(1);
  }
  return data;
}

async function listEndpoints() {
  const data = await api('/endpoints');
  console.log('\n  ENDPOINTS:\n');
  for (const ep of data.endpoints || []) {
    console.log(`  ${ep.id.slice(0,8)}  ${ep.name}  ${ep.plan}  ${ep.webhook_count || 0} webhooks  ${ep.webhook_url}`);
  }
  console.log();
}

async function createEndpoint(name) {
  const data = await api('/endpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  console.log(`\n  Created: ${data.webhook_url}\n  API Key: ${data.api_key}\n`);
}

async function deleteEndpoint(id) {
  await api(`/endpoints/${id}`, { method: 'DELETE' });
  console.log(`\n  Deleted endpoint ${id}\n`);
}

async function sendWebhook(url, body) {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await resp.json();
    console.log(`\n  Status: ${data.status}`);
    console.log(`  Delivery: ${data.delivery}`);
    if (data.transformed) console.log(`  Transformed: true`);
    console.log();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function getTransform(id) {
  const data = await api(`/endpoints/${id}/transforms`);
  if (!data.transform) {
    console.log(`\n  No transform configured for ${id}\n`);
    return;
  }
  console.log(`\n  Endpoint: ${id}`);
  console.log(`  Prompt: ${data.transform.prompt}`);
  console.log(`  Model: ${data.transform.model}`);
  console.log(`  Enabled: ${data.transform.enabled ? 'yes' : 'no'}\n`);
}

async function setTransform(id, prompt) {
  if (!prompt) {
    const bufs = [];
    process.stdin.on('data', d => bufs.push(d));
    process.stdin.on('end', async () => {
      prompt = Buffer.concat(bufs).toString().trim();
      if (!prompt) { console.error('Error: prompt required'); process.exit(1); }
      const data = await api(`/endpoints/${id}/transforms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      console.log(`\n  Transform ${data.status} for ${id}\n`);
    });
    return;
  }
  const data = await api(`/endpoints/${id}/transforms`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  console.log(`\n  Transform ${data.status} for ${id}\n`);
}

async function showUsage() {
  const data = await api('/usage');
  console.log(`\n  Plan: ${data.plan}`);
  console.log(`  Period: ${data.period}`);
  console.log(`  Webhooks received: ${data.webhooks_received}`);
  console.log(`  Emails sent: ${data.emails_sent}`);
  console.log(`  Transforms run: ${data.transforms_run}`);
  console.log(`  Webhooks forwarded: ${data.webhooks_forwarded}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    help();
    return;
  }

  if (cmd === '--version' || cmd === '-v') {
    console.log('0.1.0');
    return;
  }

  switch (cmd) {
    case 'endpoints':
      await listEndpoints();
      break;
    case 'endpoints:create':
      await createEndpoint(args[1]);
      break;
    case 'endpoints:delete':
      await deleteEndpoint(args[1]);
      break;
    case 'send': {
      const url = args[1];
      const jsonIdx = args.indexOf('-d');
      const body = jsonIdx >= 0 ? args[jsonIdx + 1] : '{"event":"test","source":"we-cli"}';
      if (!url) { console.error('Usage: we send <webhook_url> [-d json]'); process.exit(1); }
      await sendWebhook(url, body);
      break;
    }
    case 'transform:get':
      await getTransform(args[1]);
      break;
    case 'transform:set':
      await setTransform(args[1], args.indexOf('-p') >= 0 ? args[args.indexOf('-p') + 1] : null);
      break;
    case 'usage':
      await showUsage();
      break;
    default:
      console.error(`Unknown command: ${cmd}\nRun 'we help' for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
