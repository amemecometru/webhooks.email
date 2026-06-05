# Dead Letter Queue

Failed webhook deliveries are captured with full context. Replay, inspect, or bulk-export them.

## When to use

- A destination server goes down and you need to recover the lost data
- You want to inspect exactly what was sent and what error was returned
- You need automatic retry with exponential backoff

## How it works

1. Webhook is sent to destination
2. Destination returns 4xx/5xx or is unreachable
3. Payload, headers, error, and timestamp are stored in the dead letter queue
4. Automatic retry at increasing intervals: 1min, 2min, 4min, 8min, 16min
5. After max retries, the webhook remains in the DLQ for manual replay

## Limits

| Plan | Retries | Available |
|------|---------|-----------|
| Free | — | No |
| Pro | 3 max | Yes |
| Enterprise | 5 max | Yes |

## API

List dead letters:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://app.webhooks.email/api/dead-letters
```

Replay a dead letter:
```bash
curl -X POST https://app.webhooks.email/api/dead-letters/{dl_id}/replay \
  -H "Authorization: Bearer YOUR_API_KEY"
```
