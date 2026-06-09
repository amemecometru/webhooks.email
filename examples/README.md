# webhooks.email — Examples

Dead-simple examples to get started with [webhooks.email](https://webhooks.email).

## Quick Start

```bash
# Create an endpoint and send a webhook in one command
bash curl-webhook.sh
```

## Examples

| File | Description |
|------|-------------|
| `curl-webhook.sh` | Create endpoint, add destination, send webhook, check usage — all with curl |
| `github-action.yml` | GitHub Actions workflow that sends webhooks on push/PR/release events |

## Usage

### 1. cURL Script

```bash
# Basic: create endpoint + send test webhook
bash curl-webhook.sh

# With a destination URL
DEST=https://myserver.com/hook bash curl-webhook.sh
```

### 2. GitHub Action

1. Copy `github-action.yml` to `.github/workflows/webhook-notify.yml` in your repo.
2. Add your webhook URL as a repository secret named `WEBHOOK_URL`.
3. Push to `main` — webhooks fire automatically.

## Get Your Endpoint

1. Sign up at [app.webhooks.email](https://app.webhooks.email)
2. Create an endpoint — get a URL like `https://you.webhooks.email/hook/{id}`
3. Point any sender to that URL

---

Licensed under MIT. Use freely.
