# Setup: WhatsApp

How to connect Mosonic (neutral-tex) to WhatsApp for account linking and notify push.

Outbound notify can use either the **Go `whatsapp-service`** (Meta Cloud API token in Nest) or **Zernio’s inbox API**, controlled by `WHATSAPP_USE_GOLANG`.

**Zernio-only walkthrough:** [setup-whatsapp-zernio.md](./setup-whatsapp-zernio.md)

Related: [LINE](./setup-line.md) · [Telegram](./setup-telegram.md) · [Viber](./setup-viber.md) · [WhatsApp via Zernio](./setup-whatsapp-zernio.md)  
Proxy details: `communication-service/app/whatsapp-service/INTEGRATION.md`

---

## Transport modes (`WHATSAPP_USE_GOLANG`)

| Flag | Outbound notify path | Prerequisites |
|------|----------------------|---------------|
| `true` (default / unset) | Nest → Go `whatsapp-service` → Meta Graph API | Meta access token + phone number ID in Nest; whatsapp-service running |
| `false` | Nest → Zernio inbox REST → WhatsApp | `ZERNIO_API_KEY`; user’s WABA connected **in Zernio** (SocialAccount `channel=whatsapp`) |

Connect / QR / inbound webhook stay on the Mosonic CONNECT flow (`whatsapp_connections.whatsappWaId`). Only **outbound `sendText` / notify** switches transport.

```
User (WhatsApp)  →  Meta  →  Nest /whatsapp/webhook/direct  (HTTPS required)
                               │
                               ├─ CONNECT <code> → link WhatsAppConnection
                               └─ welcome / replies

Notify (Go mode):
Nest CommsNotify  →  whatsapp-service (:8089)  →  Graph API
                     + X-WhatsApp-Access-Token
                     + X-WhatsApp-Phone-Number-Id

Notify (Zernio mode):
Nest CommsNotify  →  Zernio POST /v1/inbox/...  →  Meta (via Zernio WABA)
```

**Constraints**

- Zernio mode does **not** remove the need for a Meta WABA — ownership moves to Zernio’s connection instead of Nest’s Cloud API token.
- Free-form messages only work inside the **24-hour customer care window**. Cold notifies need an **approved template** (`WHATSAPP_ZERNIO_TEMPLATE_NAME` in Zernio mode; Meta templates / Go path otherwise).
- Inbound CONNECT still needs a reachable webhook (Nest direct or forwarder). Zernio inbox webhooks are out of scope for this flag.

---

## Prerequisites (shared)

- Nest server + Redis (CONNECT codes)
- Prisma migration `whatsapp_connections` applied
- Public HTTPS URL to Nest for inbound CONNECT (production or tunnel with a valid cert)
- `WHATSAPP_BUSINESS_PHONE` for QR / `wa.me` (digits, no `+`)

### Go mode extras

- [Meta Developer](https://developers.facebook.com/) app with WhatsApp product
- Permanent (or long-lived) access token, Phone number ID, App secret
- Go 1.22+ (whatsapp-service)
- `COMMUNICATION_GATEWAY_SECRET` matching whatsapp-service `GATEWAY_SECRET`

### Zernio mode extras

- `ZERNIO_API_KEY` configured
- WhatsApp Business account connected on the user’s Zernio profile (same flow as other social accounts)
- Optional: approved Meta/Zernio template name for notifies outside the 24h window
- Full steps: [setup-whatsapp-zernio.md](./setup-whatsapp-zernio.md)

---

## 1. Create the WhatsApp Cloud API app (Go mode / CONNECT webhook)

Still required for **inbound CONNECT** when Meta delivers webhooks to Nest. In Zernio mode you may use a different WABA for outbound send (the one linked in Zernio), but CONNECT QR + webhook still need a reachable Meta app pointing at Nest unless you later add Zernio inbox webhooks.

1. In Meta Developer, create (or open) an app and add **WhatsApp**.
2. Copy:
   - **Access token** (system user / permanent token recommended for production) — Go mode sends
   - **Phone number ID** — Go mode sends
   - **Display phone number** (E.164 digits without `+`, e.g. `15551234567`)
   - **App secret** (App settings → Basic)
3. Choose a **Verify token** string you will set as `WHATSAPP_VERIFY_TOKEN` (any secret you invent).
4. Subscribe the webhook to the `messages` field for your WhatsApp Business Account.

---

## 2. Start whatsapp-service (Go mode)

Required when `WHATSAPP_USE_GOLANG=true` (outbound) and always useful for QR generation via the proxy.

```bat
cd communication-service\app\whatsapp-service
copy .env.example .env
rem set GATEWAY_SECRET=hello
run.bat
```

Health check:

```bash
curl http://localhost:8089/api/v1/healthz
```

Via gateway: `http://localhost:8099/comms/whatsapp/api/v1/healthz`

---

## 3. Configure Nest (`server/.env`)

```env
COMMUNICATION_GATEWAY_SECRET=hello

WHATSAPP_SERVICE_URL=http://localhost:8089
# Or: http://localhost:8099/comms/whatsapp

# true = Go whatsapp-service (Meta token in Nest)
# false = Zernio inbox API (needs WhatsApp account connected via Zernio)
WHATSAPP_USE_GOLANG=true

# Used only when WHATSAPP_USE_GOLANG=false and the 24h window is closed (optional cold notify)
WHATSAPP_ZERNIO_TEMPLATE_NAME=
WHATSAPP_ZERNIO_TEMPLATE_LANGUAGE=en

WHATSAPP_ACCESS_TOKEN=<from Meta>
WHATSAPP_PHONE_NUMBER_ID=<from Meta>
WHATSAPP_BUSINESS_PHONE=15551234567
WHATSAPP_APP_SECRET=<from Meta App settings>
WHATSAPP_VERIFY_TOKEN=<your-chosen-verify-token>
WHATSAPP_WELCOME_MESSAGE=Welcome to Mosonic!
WHATSAPP_CALLBACK_TOKEN=
WHATSAPP_WEBHOOK_URL=https://<public-host>/whatsapp/webhook/direct
WHATSAPP_TENANT_ID=00000000-0000-0000-0000-000000000001
WHATSAPP_ACTOR_ID=00000000-0000-0000-0000-000000000002
```

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_USE_GOLANG` | `true`/unset → Go proxy; `false`/`0` → Zernio inbox |
| `WHATSAPP_ZERNIO_TEMPLATE_NAME` | Optional approved template for Zernio cold notify |
| `WHATSAPP_ZERNIO_TEMPLATE_LANGUAGE` | Template language (default `en`) |
| `WHATSAPP_SERVICE_URL` | Outbound send (Go) + QR |
| `WHATSAPP_ACCESS_TOKEN` | Go mode: `X-WhatsApp-Access-Token` (not required for Zernio **send**) |
| `WHATSAPP_PHONE_NUMBER_ID` | Go mode: `X-WhatsApp-Phone-Number-Id` |
| `WHATSAPP_BUSINESS_PHONE` | QR / `https://wa.me/<phone>` deep link (digits, no `+`) |
| `WHATSAPP_APP_SECRET` | HMAC key for `X-Hub-Signature-256` |
| `WHATSAPP_VERIFY_TOKEN` | Meta `hub.verify_token` handshake |
| `WHATSAPP_WEBHOOK_URL` | Documented target for Meta webhook config |
| `WHATSAPP_WELCOME_MESSAGE` | On first inbound when not yet linked |
| `WHATSAPP_CALLBACK_TOKEN` | **Leave empty** for Meta → `/whatsapp/webhook/direct`. Only set if the Callback URL includes `?token=...` (or Go forwarder). If set without `?token=` on the URL, Meta POSTs are rejected and CONNECT never links. |

Restart Nest after changing env.

---

## 4. Register the webhook (required)

Meta requires HTTPS. Point the Callback URL at Nest.

**Direct (recommended):**

```
https://<your-public-host>/whatsapp/webhook/direct
```

- **Verify token:** same value as `WHATSAPP_VERIFY_TOKEN`
- Nest `GET` returns `hub.challenge` as plain text when `hub.mode=subscribe` and the token matches
- Nest `POST` verifies `X-Hub-Signature-256` = `sha256=` + hex(HMAC-SHA256(`WHATSAPP_APP_SECRET`, raw body))

Local/dev: use a tunnel with a **trusted** certificate.

**Via whatsapp-service forwarder (optional):**

```
https://<gateway>/comms/whatsapp/api/v1/webhooks?app_secret=<APP_SECRET>&verify_token=<VERIFY_TOKEN>&callback_url=https://<host>/whatsapp/webhook?token=<WHATSAPP_CALLBACK_TOKEN>
```

Meta would then call the gateway/proxy; the proxy verifies HMAC and forwards `{ events: [...] }` to Nest.

---

## 5. User connect flow (UI)

1. **Account settings → Get in touch → WhatsApp → Connect**.
2. Nest returns QR (`https://wa.me/<business>?text=CONNECT+CODE`) + `CONNECT <code>`.
3. User opens the chat and sends `CONNECT ABC123` (QR may pre-fill the text).
4. Webhook upserts `whatsapp_connections` (`whatsappWaId` = user phone digits / `wa_id`).
5. Notifies fan out to WhatsApp when linked (with LINE/Telegram/Viber if also connected).

For **Zernio mode** notifies, also connect WhatsApp on the user’s Zernio profile so Mosonic can resolve `accountId`.

---

## 6. Database

Ensure migration applied:

```bash
cd neutral-tex/server
npx prisma migrate deploy
```

Table: `whatsapp_connections` (`userId`, `whatsappWaId`).

---

## 7. Verify

| Check | How |
|-------|-----|
| Proxy up (Go) | `GET http://localhost:8089/api/v1/healthz` |
| Meta verify | Webhook subscription succeeds; Nest returns challenge |
| Link | Send CONNECT; row in `whatsapp_connections` |
| Push (Go) | Notify with WhatsApp linked (within 24h window) |
| Push (Zernio) | `WHATSAPP_USE_GOLANG=false` + WhatsApp SocialAccount; free-form or template |
| Signature errors | App secret mismatch or body altered before HMAC |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Webhook verify fails | Wrong `WHATSAPP_VERIFY_TOKEN` or Nest not publicly reachable |
| CONNECT never links | Webhook not subscribed to `messages` / Nest not reachable |
| Invalid signature | Wrong `WHATSAPP_APP_SECRET` or raw body middleware missing |
| Send fails with 131047 / window | Outside 24h customer care window — user must message first, or use a template |
| Zernio send: no account | User has no Zernio WhatsApp SocialAccount |
| Zernio cold notify fails | Set `WHATSAPP_ZERNIO_TEMPLATE_NAME` to an approved template |
| Send fails auth (Go) | Invalid access token or phone number ID |
| QR wrong number | Wrong `WHATSAPP_BUSINESS_PHONE` |
| Gateway 401 | Secret mismatch |

---

## Notes vs other channels

| | Telegram | Viber | WhatsApp |
|--|----------|-------|----------|
| Local inbound | `TELEGRAM_POLLING=true` | HTTPS webhook only | HTTPS webhook only |
| Credential headers | `X-Telegram-Bot-Token` | `X-Viber-Auth-Token` | Go: access token + phone number ID; Zernio: API key + accountId |
| Webhook auth | Shared secret header | HMAC-SHA256 of body | `X-Hub-Signature-256` + verify token GET |
| Deep link | `https://t.me/<bot>` | `viber://pa?chatURI=` | `https://wa.me/<phone>?text=` |
| Messaging window | Open | Open (after subscribe) | **24h** session after user message |
