# Setup

## 1. Get an API key

Sign up at https://app.webhooks.email and copy your API key from the dashboard.

## 2. Create an endpoint

```bash
curl -X POST https://app.webhooks.email/api/endpoints \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-service"}'
```

Save the returned `webhook_url` and `api_key`.

## 3. Add a destination

```bash
curl -X POST https://app.webhooks.email/api/endpoints/abc-123/destinations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://myserver.com/webhook-handler"}'
```

## 4. Send a test webhook

```bash
curl -X POST https://you.webhooks.email/hook/abc-123 \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "message": "hello world"}'
```
