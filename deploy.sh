#!/usr/bin/env bash
# =============================================================================
#  webhooks.email  —  Deploy Script
#  Run this from your LOCAL machine (not Codespace).
#  Requires: wrangler CLI (Node 22+), Cloudflare login
# =============================================================================
set -euo pipefail

echo "==> 1. Log in to Cloudflare"
npx wrangler login

echo ""
echo "==> 2. Create D1 database"
npx wrangler d1 create webhooks-email-db

echo ""
echo "==> 3. Update wrangler.jsonc with the D1 database ID from step 2"
echo "    Edit worker/wrangler.jsonc and replace WEBHOOKS_DB_ID with the actual ID"
read -p "    Press Enter after you've updated the ID..."

echo ""
echo "==> 4. Initialize the database schema"
npx wrangler d1 execute webhooks-email-db --file=./schema.sql

echo ""
echo "==> 5. Set required Worker secrets"
echo "    You'll need the following secrets. Press Enter to skip any."
echo ""
echo "    --- OpenRouter (for AI Webhook Transform) ---"
read -p "    OPENROUTER_KEY_1 (3 keys for load balancing): " OR1
if [ -n "$OR1" ]; then npx wrangler secret put OPENROUTER_KEY_1 <<< "$OR1"; fi
read -p "    OPENROUTER_KEY_2: " OR2
if [ -n "$OR2" ]; then npx wrangler secret put OPENROUTER_KEY_2 <<< "$OR2"; fi
read -p "    OPENROUTER_KEY_3: " OR3
if [ -n "$OR3" ]; then npx wrangler secret put OPENROUTER_KEY_3 <<< "$OR3"; fi

echo ""
echo "    --- Email (for Webhook → Email forwarding) ---"
read -p "    EMAIL_API_KEY (SendGrid API key): " EAK
if [ -n "$EAK" ]; then npx wrangler secret put EMAIL_API_KEY <<< "$EAK"; fi
read -p "    EMAIL_FROM (sender address, default: noreply@webhooks.email): " EF
if [ -n "$EF" ]; then npx wrangler secret put EMAIL_FROM <<< "$EF"; fi

echo ""
echo "    --- Stripe (for billing) ---"
read -p "    STRIPE_SECRET_KEY: " SSK
if [ -n "$SSK" ]; then npx wrangler secret put STRIPE_SECRET_KEY <<< "$SSK"; fi
read -p "    STRIPE_WEBHOOK_SECRET: " SWS
if [ -n "$SWS" ]; then npx wrangler secret put STRIPE_WEBHOOK_SECRET <<< "$SWS"; fi

echo ""
echo "==> 6. Deploy the Worker (API + webhook ingestion + cron)"
cd worker
npx wrangler deploy
cd ..

echo ""
echo "==> 7. Deploy the marketing site to Cloudflare Pages"
echo "    Option A: Connect the GitHub repo via Cloudflare Pages dashboard"
echo "      - Build command: (empty)"
echo "      - Build output: /site"
echo ""
echo "    Option B: Deploy via CLI:"
echo "      npx wrangler pages deploy ./site --project-name=webhooks-email"

echo ""
echo "==> 8. Configure DNS"
echo "    In Cloudflare dashboard, add webhooks.email:"
echo "      - CNAME @ -> webhooks-email.pages.dev  (marketing site)"
echo "      - CNAME api -> your-worker.your-subdomain.workers.dev"
echo ""
echo "==> Done!"
echo ""
echo "After deploying, test with:"
echo "  # Create an endpoint"
echo '  curl -X POST https://api.webhooks.email/api/endpoints \'
echo '    -H "Content-Type: application/json" \'
echo '    -d "{\"name\":\"test\",\"destinations\":[\"https://webhook.site/your-test-url\"]}"'
echo ""
echo "  # Send a webhook"
echo '  curl -X POST https://you.webhooks.email/hook/ENDPOINT_ID \'
echo '    -H "Content-Type: application/json" \'
echo '    -d "{\"event\":\"test\",\"data\":\"hello\"}"'
