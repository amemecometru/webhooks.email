# Email Bridge

Turn any email into a webhook. Send email to `anything@you.webhooks.email` and we POST it to your destinations as a structured JSON payload.

## When to use

- You need to receive data from systems that can only send email (legacy apps, forms, scanners)
- You want to convert email-based alerts into webhook events for your automation
- You need email-to-webhook for customer support integrations

## How it works

```
Email → SMTP → webhooks.email → MIME parser → Webhook POST → Your server
```

Each email is parsed and delivered as:

```json
{
  "source": "email",
  "email": {
    "from": {"name": "Alice", "address": "alice@gmail.com"},
    "to": ["you@your-subdomain.webhooks.email"],
    "subject": "New support ticket",
    "text_body": "My account is not loading...",
    "html_body": "<p>My account is not loading...</p>",
    "attachments": [{"filename": "screenshot.png", "content_type": "image/png", "size": 24576}],
    "headers": {"received-spf": "pass", "dkim": "signature=..."},
    "spf_status": "pass",
    "dkim_status": "pass"
  }
}
```

## Limits

| Plan | Emails per day |
|------|---------------|
| Free | 5 |
| Pro | 500 |
| Enterprise | Unlimited |

## Setup

1. Create an endpoint in the dashboard
2. Your endpoint automatically gets `anything@you.webhooks.email`
3. Send an email to that address — the webhook fires to all your destinations
