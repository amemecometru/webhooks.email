#!/usr/bin/env bash
# =============================================================================
#  webhooks.email — cURL Integration Template
#  Create an endpoint, send a webhook, check usage.
#  Run:  bash curl-webhook.sh
# =============================================================================
set -euo pipefail

API="${API:-https://api.webhooks.email}"
NAME="${NAME:-my-endpoint}"
DEST="${DEST:-}"  # optional destination URL, e.g. https://myserver.com/hook

echo "==> 1. Creating endpoint: $NAME"
RESP=$(curl -s -X POST "$API/api/endpoints" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$NAME\"}")

ENDPOINT_ID=$(echo "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
API_KEY=$(echo "$RESP" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
WEBHOOK_URL=$(echo "$RESP" | grep -o '"webhook_url":"[^"]*"' | cut -d'"' -f4)

echo "  Endpoint ID: $ENDPOINT_ID"
echo "  Webhook URL: $WEBHOOK_URL"
echo "  API Key:     $API_KEY"

# Save for later use
echo "$API_KEY" > /tmp/we-api-key.txt
echo "$WEBHOOK_URL" > /tmp/we-webhook-url.txt

if [ -n "$DEST" ]; then
  echo ""
  echo "==> 2. Adding destination: $DEST"
  curl -s -X POST "$API/api/endpoints/$ENDPOINT_ID/destinations" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$DEST\"}" > /dev/null
  echo "  Destination added."
fi

echo ""
echo "==> 3. Sending a test webhook"
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "deploy.complete",
    "service": "api",
    "status": "success",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }' | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "==> 4. Checking usage"
curl -s "$API/api/usage" \
  -H "Authorization: Bearer $API_KEY" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "  Done! Webhook sent successfully."
echo "  View logs at: https://app.webhooks.email/#endpoint/$ENDPOINT_ID"
