# Webhook Ingestion

Use Webhooks.Email to receive, forward, and monitor webhooks at your own endpoint.

## When to use

- You need to receive webhooks at `you.webhooks.email/hook/{id}`
- You want to forward webhooks to one or many destinations with automatic retry
- You need a searchable audit log of every incoming webhook
- You want to inspect and replay failed deliveries

## Quickstart

```bash
# Create an endpoint
curl -X POST https://app.webhooks.email/api/endpoints \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "destinations": [{"url": "https://myserver.com/webhooks"}]}'

# Response includes your webhook_url and api_key
```

```bash
# Send a webhook
curl -X POST https://you.webhooks.email/hook/abc-123 \
  -H "Content-Type: application/json" \
  -d '{"event": "user.created", "user_id": "42"}'
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/endpoints` | Create endpoint |
| GET | `/api/endpoints` | List endpoints |
| GET | `/api/endpoints/:id` | Get endpoint |
| DELETE | `/api/endpoints/:id` | Delete endpoint |
| POST | `/hook/:id` | Send webhook (any method) |
| GET | `/api/endpoints/:id/logs` | Get webhook logs |
| GET | `/api/usage` | Get usage stats |

## CLI

```bash
npx @webhooks.email/skills endpoints          # list endpoints
npx @webhooks.email/skills send <url> -d '{}'  # send test webhook
```
