// Example: Verify Webhooks.Email signature
// Webhooks.Email adds x-webhook-transformed and x-webhook-model headers
// when AI transforms are enabled. Verify your API key matches.
function verifyWebhook(req, apiKey) {
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${apiKey}`) {
    throw new Error('Invalid signature');
  }
  return true;
}
