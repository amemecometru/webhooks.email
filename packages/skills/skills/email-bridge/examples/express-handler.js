// Example: Set up an email-to-webhook handler
// 1. Create endpoint with an email destination
// 2. Any email sent to you@your-subdomain.webhooks.email
//    becomes a POST to your webhook handler
const express = require('express');
const app = express();

app.post('/email-webhook', express.json(), (req, res) => {
  const email = req.body.email;
  console.log(`Email from: ${email.from.address}`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Body: ${email.text_body}`);
  if (email.attachments?.length) {
    console.log(`Attachments: ${email.attachments.map(a => a.filename).join(', ')}`);
  }
  res.sendStatus(200);
});

app.listen(3000);
