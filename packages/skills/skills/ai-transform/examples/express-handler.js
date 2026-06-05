// Example: Handle AI-transformed webhooks
// The transform modifies the payload before forwarding.
// Check x-webhook-transformed header to know if transform was applied.
const express = require('express');
const app = express();

app.post('/transformed', express.json(), (req, res) => {
  const transformed = req.headers['x-webhook-transformed'] === 'true';
  const model = req.headers['x-webhook-model'];
  const error = req.headers['x-webhook-transform-error'];

  console.log(`Transformed: ${transformed}`);
  if (model) console.log(`Model: ${model}`);
  if (error) console.log(`Transform error: ${error}`);
  console.log('Payload:', req.body);

  res.sendStatus(200);
});

app.listen(3000);
