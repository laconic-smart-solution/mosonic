# Setup: WhatsApp via Zernio

Outbound WhatsApp **notify** through Zernio’s inbox API (`WHATSAPP_USE_GOLANG=false`), instead of Nest → Go `whatsapp-service` → Meta.

Related: [WhatsApp (Go / Meta Cloud API)](./setup-whatsapp.md) · [LINE](./setup-line.md) · [Telegram](./setup-telegram.md) · [Viber](./setup-viber.md)  
Zernio inbox docs: [Create conversation](https://docs.zernio.com/messages/create-inbox-conversation) · [Send message](https://docs.zernio.com/messages/send-inbox-message) · [WhatsApp inbox](https://docs.zernio.com/platforms/whatsapp/inbox)

---

## What this mode does

| Concern | Handled by |
|---------|------------|
| Outbound notify (`sendText`) | Nest → Zernio REST inbox → Meta (WABA owned by Zernio connection) |
| Recipient phone | Mosonic `whatsapp_connections.whatsappWaId` (CONNECT link) |
| Sender WhatsApp number | User’s Zernio-connected WhatsApp account (`SocialAccount` / `channel=whatsapp`) |

```
Notify (Zernio mode):
  CommsNotify → WhatsAppService.sendText
             → Zernio POST /v1/inbox/conversations/...
             → Meta (via Zernio WABA)

CONNECT (unchanged):
  User WhatsApp → Meta webhook → Nest → whatsapp_connections
```

You do **not** create a Telegram-style bot. You connect a **WhatsApp Business Account (WABA)** in Zernio.

---

## Prerequisites

- Nest server + Redis
- `whatsapp_connections` migration applied
- `ZERNIO_API_KEY` already working for social publish
- A Meta WABA + phone number you can connect **inside Zernio** (Zernio dashboard / Mosonic social connect)
- For recipient linking (who gets notifies): Mosonic CONNECT flow still needs a reachable Nest webhook — see [setup-whatsapp.md](./setup-whatsapp.md) § webhook. Zernio inbox webhooks are **not** used for CONNECT yet.

---

## 1. Connect WhatsApp in Zernio

1. In Mosonic, connect social accounts as usual until the user has a **Zernio profile**.
2. Connect **WhatsApp** on that profile (same pattern as Instagram/X/etc. via Zernio).
3. Confirm Mosonic stored an active account with `channel=whatsapp` (SocialAccount / connected-accounts sync).

Without this `accountId`, Zernio-mode send fails with “No Zernio WhatsApp account connected”.

The WABA behind that connection is what sends messages. Nest’s `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` are **not** used for outbound send in this mode.

---

## 2. Configure Nest (`server/.env`)

### Required for Zernio send

```env
WHATSAPP_USE_GOLANG=false
ZERNIO_API_KEY=<your_zernio_api_key>
```

### Recommended (cold notify / outside 24h window)

```env
# Approved Meta template name as it appears in Zernio / Meta Business Manager
WHATSAPP_ZERNIO_TEMPLATE_NAME=hello_world
WHATSAPP_ZERNIO_TEMPLATE_LANGUAGE=en
```

Free-form inbox messages only work inside WhatsApp’s **24-hour customer care window** (after the recipient last messaged the business number). Outside that window Mosonic falls back to creating/sending via the template if `WHATSAPP_ZERNIO_TEMPLATE_NAME` is set. The notify text is passed as a template body param when possible — design the template accordingly (e.g. one `{{1}}` body variable).

### Not required for Zernio outbound send

Leave empty (or unused):

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

`whatsapp-service` (:8089) is **not** required for outbound notify in Zernio mode.

### Still needed for CONNECT / QR (recipient linking)

If users link WhatsApp under **Account settings → Get in touch**, keep the Meta webhook + display phone setup from [setup-whatsapp.md](./setup-whatsapp.md):

```env
WHATSAPP_BUSINESS_PHONE=15551234567
WHATSAPP_APP_SECRET=<from Meta>
WHATSAPP_VERIFY_TOKEN=<your-chosen-verify-token>
WHATSAPP_WEBHOOK_URL=https://<public-host>/whatsapp/webhook/direct
# Optional: QR via Go proxy
WHATSAPP_SERVICE_URL=http://localhost:8089
COMMUNICATION_GATEWAY_SECRET=hello
```

Notify needs **both**:

1. Recipient: row in `whatsapp_connections` (CONNECT).
2. Sender: Zernio WhatsApp `accountId` on that same Mosonic user.

Restart Nest after changing env.

---

## 3. Env cheat sheet

| Variable | Zernio mode |
|----------|-------------|
| `WHATSAPP_USE_GOLANG` | **`false`** (or `0`) |
| `ZERNIO_API_KEY` | **Required** |
| `WHATSAPP_ZERNIO_TEMPLATE_NAME` | Optional; needed for cold / outside-24h notify |
| `WHATSAPP_ZERNIO_TEMPLATE_LANGUAGE` | Optional; default `en` |
| `WHATSAPP_ACCESS_TOKEN` | Not used for send |
| `WHATSAPP_PHONE_NUMBER_ID` | Not used for send |
| `WHATSAPP_BUSINESS_PHONE` | CONNECT / QR only |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` | CONNECT webhook only |

---

## 4. How send works

1. `WhatsAppNotifyService` loads `whatsapp_connections` for the user → `whatsappWaId` (E.164 digits).
2. Nest resolves Zernio WhatsApp `accountId` from connected accounts (`channel === 'whatsapp'`).
3. Search Zernio inbox for an existing conversation with that phone.
4. If found: `POST /v1/inbox/conversations/{id}/messages` with `{ accountId, message }`.
5. If free-form fails (window closed / `TEMPLATE_REQUIRED`) or no thread: `POST /v1/inbox/conversations` with `templateName` + `participantId` when template env is set.

---

## 5. Verify

| Check | How |
|-------|-----|
| Flag | Nest has `WHATSAPP_USE_GOLANG=false` |
| Zernio auth | Social publish / API calls succeed with `ZERNIO_API_KEY` |
| Sender | User has active WhatsApp on Zernio profile (synced to Mosonic) |
| Recipient | User completed CONNECT → row in `whatsapp_connections` |
| In-window push | User messages the business number, then trigger a notify |
| Cold push | Template approved + `WHATSAPP_ZERNIO_TEMPLATE_NAME` set; trigger notify |

---

## 6. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| No Zernio WhatsApp account connected | Connect WhatsApp on the user’s Zernio profile and sync accounts |
| Free-form send fails / template required | Outside 24h window — set `WHATSAPP_ZERNIO_TEMPLATE_NAME` |
| Notify never attempts send | User has no `whatsapp_connections` row (CONNECT not done) |
| Wrong sender number | Different WABA connected in Zernio than expected |
| CONNECT still broken | Unrelated to Zernio send — fix Meta webhook per [setup-whatsapp.md](./setup-whatsapp.md) |
| Unauthorized from Zernio | Bad or missing `ZERNIO_API_KEY` |

---

## Constraints (read once)

- Zernio mode **moves WABA ownership** to Zernio’s connection; it does not remove Meta/WhatsApp Business requirements.
- Same WhatsApp **24h rule** as Cloud API: free-form in-session; templates for business-initiated / re-open.
- Inbound CONNECT still uses Nest’s Meta webhook unless you later add Zernio inbox webhooks (out of scope today).
- Go mode remains available: set `WHATSAPP_USE_GOLANG=true` and follow [setup-whatsapp.md](./setup-whatsapp.md).
