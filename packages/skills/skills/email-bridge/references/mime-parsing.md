# MIME Parsing Reference

When an email is received, the following fields are extracted:

| Field | Type | Description |
|-------|------|-------------|
| `from.name` | string | Sender display name |
| `from.address` | string | Sender email address |
| `to` | string[] | Recipient addresses |
| `cc` | string[] | CC recipients |
| `subject` | string | Email subject line |
| `text_body` | string | Plain text body |
| `html_body` | string | HTML body (if present) |
| `attachments` | object[] | List of parsed attachments |
| `headers` | object | Full email headers |
| `spf_status` | string | SPF verification result |
| `dkim_status` | string | DKIM verification result |

## Attachment format

```json
{
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "size": 65536,
  "base64": "base64-encoded-content"
}
```

Attachments are base64-encoded. Size limit: 10MB per email.
