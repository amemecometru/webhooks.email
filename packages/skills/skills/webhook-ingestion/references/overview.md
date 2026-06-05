# Webhook Ingestion Overview

Every Webhooks.Email account gets a unique endpoint URL at:
`https://you.webhooks.email/hook/{endpoint_id}`

## Supported methods

- GET, POST, PUT, PATCH, DELETE — any HTTP method is accepted and logged.

## What happens when a webhook arrives

1. **Logging** — Headers, body, method, and timestamp are captured.
2. **AI Transform** (optional, Pro+) — Payload is rewritten by an LLM before forwarding.
3. **Forwarding** — Payload is sent to all configured destinations.
4. **Email notification** (optional) — Payload is sent as an email to configured addresses.
5. **Dead letter queue** (Pro+) — Failed deliveries are stored for replay.

## Limits

| Plan | Webhooks/mo | Destinations | Retention |
|------|-------------|--------------|-----------|
| Free | 1,000 | 2 | 7 days |
| Pro | 100,000 | Unlimited | 30 days |
| Enterprise | 5,000,000 | Unlimited | 90 days |
