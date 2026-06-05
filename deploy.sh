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
echo "==> 5. Deploy the Worker (API + webhook ingestion)"
cd worker
npx wrangler deploy
cd ..

echo ""
echo "==> 6. Deploy the marketing site to Cloudflare Pages"
echo "    Option A: Connect the GitHub repo via Cloudflare Pages dashboard"
echo "      - Build command: (empty)"
echo "      - Build output: /site"
echo ""
echo "    Option B: Deploy via CLI:"
echo "      npx wrangler pages deploy ./site --project-name=webhooks-email"

echo ""
echo "==> 7. Configure DNS"
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
