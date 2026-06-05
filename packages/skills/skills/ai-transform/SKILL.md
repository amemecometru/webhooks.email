# AI Transform

Attach a transform prompt to any endpoint. Every incoming webhook gets rewritten by an LLM before being forwarded.

## When to use

- Senders emit bloated payloads and you only need 3 fields
- You need to normalize webhooks from different providers into a consistent schema
- You want to enrich payloads with derived data
- You need to rename/reshape fields without writing middleware code

## How it works

```
Raw webhook → Endpoint → OpenRouter LLM (your prompt) → Transformed payload → Your server
```

## Example

Set a prompt:
```bash
curl -X PUT https://app.webhooks.email/api/endpoints/abc-123/transforms \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Extract only the id, status, and total fields. Rename total to amount. Lowercase status.",
    "model": "openai/gpt-4o-mini"
  }'
```

Send a webhook:
```bash
curl -X POST https://you.webhooks.email/hook/abc-123 \
  -d '{"id":"in_1","object":"invoice","status":"PAID","total":4999,"customer_name":"Alice"}'
```

What your destination receives:
```json
{"id": "in_1", "status": "paid", "amount": 4999}
```

## Models

Any OpenRouter model. Default: `openai/gpt-4o-mini`. Use the `model` field to switch.

## Error handling

If the LLM call fails, the original payload is forwarded and `x-webhook-transform-error` header is set.
