# @webhooks.email/skills

Agent skills and CLI for [Webhooks.Email](https://webhooks.email) — webhook ingestion, email bridge, AI transform, dead letter queue, and scheduled delivery.

```bash
npx skills add @webhooks.email/skills --skill webhook-ingestion
npx skills add @webhooks.email/skills --skill email-bridge
npx skills add @webhooks.email/skills --skill ai-transform
npx skills add @webhooks.email/skills --skill dead-letter-queue
npx skills add @webhooks.email/skills --skill scheduled-webhooks
```

## Why this beats Hookdeck

| Hookdeck Skills | Webhooks.Email Skills |
|---|---|
| Teach you to receive webhooks | We **are** the webhook receiver — use us directly |
| Passive: help you write handler code | Active: CLI + API to manage your webhook infrastructure |
| No email bridge | Email-to-webhook and webhook-to-email built in |
| No AI transforms | LLM-powered payload rewriting with any OpenRouter model |
| No CLI for resource management | `we` CLI: create endpoints, send webhooks, set transforms |

## CLI

```bash
npm install -g @webhooks.email/skills
export WE_API_KEY=sk_xxx
we endpoints
we send https://you.webhooks.email/hook/abc-123 -d '{"event":"test"}'
we transform:set abc-123 -p 'Extract only id and status'
we usage
```

## Skills

| Skill | Description |
|-------|-------------|
| `webhook-ingestion` | Receive, forward, and monitor webhooks |
| `email-bridge` | Turn emails into webhook POSTs |
| `ai-transform` | Rewrite payloads with LLMs before forwarding |
| `dead-letter-queue` | Capture, inspect, and replay failed deliveries |
| `scheduled-webhooks` | Cron-triggered HTTP requests |

## License

MIT
