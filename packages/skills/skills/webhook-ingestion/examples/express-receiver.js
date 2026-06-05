// Example: Receive webhooks with Express
const express = require('express');
const app = express();

app.post('/webhooks', express.json(), (req, res) => {
  console.log('Webhook received:', req.body);
  // Your business logic here
  res.sendStatus(200);
});

app.listen(3000, () => console.log('Listening on :3000'));
