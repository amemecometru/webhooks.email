# Destinations

Each endpoint can forward webhooks to multiple destinations simultaneously.

## Add a destination

```bash
curl -X POST https://app.webhooks.email/api/endpoints/{id}/destinations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks"}'
```

## Remove a destination

```bash
curl -X DELETE https://app.webhooks.email/api/endpoints/{id}/destinations/{dest_id} \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Email destinations

```bash
curl -X POST https://app.webhooks.email/api/endpoints/{id}/email-destinations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "alerts@example.com", "subject_template": "{{method}} webhook received at {{date}}"}'
```

Webhooks forwarded to email destinations include:
- Subject line from the template or default
- Plain text body with method, endpoint info, and payload
- HTML body with formatted JSON payload
