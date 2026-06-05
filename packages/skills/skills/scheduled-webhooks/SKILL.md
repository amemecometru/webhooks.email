# Scheduled Webhooks

Schedule HTTP requests to fire on a cron expression. Each execution is logged and billed as a webhook.

## When to use

- Daily health check pings to your monitoring endpoint
- Weekly report generation triggers
- Cron-based automation without managing a cron server
- Periodic webhook calls to external APIs

## API

Create a scheduled webhook:
```bash
curl -X POST https://app.webhooks.email/api/scheduled-webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cron": "0 8 * * 1",
    "method": "POST",
    "url": "https://example.com/reports/weekly",
    "headers": {"Authorization": "Bearer xxx"},
    "body": "{\"report\": \"weekly\"}"
  }'
```

List scheduled webhooks:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://app.webhooks.email/api/scheduled-webhooks
```

Delete:
```bash
curl -X DELETE https://app.webhooks.email/api/scheduled-webhooks/{id} \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Cron format

Standard 5-field cron: `minute hour day month weekday`

| Expression | Meaning |
|------------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Top of every hour |
| `0 8 * * 1-5` | 8 AM weekdays |
| `0 0 1 * *` | 1st of every month |

## Limits

| Plan | Available |
|------|-----------|
| Free | No |
| Pro | Yes |
| Enterprise | Yes |
