# Setup: WhatsApp Cloud API

How to connect Mosonic (neutral-tex) to WhatsApp Business Cloud API for account linking and notify push.

Related: [LINE](./setup-line.md) · [Telegram](./setup-telegram.md) · [Viber](./setup-viber.md)  
Proxy details: `communication-service/app/whatsapp-service/INTEGRATION.md`

---

## Architecture (Mosonic)

```
User (WhatsApp)  →  Meta  →  Nest /whatsapp/webhook/direct  (HTTPS required)
                               │
                               ├─ CONNECT <code> → link WhatsAppConnection
                               └─ welcome / replies

Nest CommsNotify  →  whatsapp-service (:8089)  →  Graph API messages
                     + X-WhatsApp-Access-Token
                     + X-WhatsApp-Phone-Number-Id
```

Credentials live in **Nest** (`server/.env`), not in whatsapp-service.

**Important:** WhatsApp Cloud API has **no** long-polling. Inbound CONNECT always needs a public **HTTPS** webhook. Free-form session messages only work inside the **24-hour customer care window** after the user last messaged you (template messages are required outside that window).

---

## Prerequisites

- [Meta Developer](https://developers.facebook.com/) app with WhatsApp product
- WhatsApp Business account + phone number (Cloud API)
- Permanent (or long-lived) access token, Phone number ID, App secret
- Public HTTPS URL to Nest (production or tunnel with a valid cert)
- Go 1.22+ (to run whatsapp-service)
- Nest server + Redis (CONNECT codes)
- `COMMUNICATION_GATEWAY_SECRET` matching whatsapp-service `GATEWAY_SECRET`
- Prisma migration `whatsapp_connections` applied

---

## 1. Create the WhatsApp Cloud API app

1. In Meta Developer, create (or open) an app and add **WhatsApp**.
2. Copy:
   - **Access token** (system user / permanent token recommended for production)
   - **Phone number ID**
   - **Display phone number** (E.164 digits without `+`, e.g. `15551234567`)
   - **App secret** (App settings → Basic)
3. Choose a **Verify token** string you will set as `WHATSAPP_VERIFY_TOKEN` (any secret you invent).
4. Subscribe the webhook to the `messages` field for your WhatsApp Business Account.

---

## 2. Start whatsapp-service

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
| `WHATSAPP_SERVICE_URL` | Outbound send + QR |
| `WHATSAPP_ACCESS_TOKEN` | Sent as `X-WhatsApp-Access-Token` |
| `WHATSAPP_PHONE_NUMBER_ID` | Sent as `X-WhatsApp-Phone-Number-Id` |
| `WHATSAPP_BUSINESS_PHONE` | QR / `https://wa.me/<phone>` deep link (digits, no `+`) |
| `WHATSAPP_APP_SECRET` | HMAC key for `X-Hub-Signature-256` |
| `WHATSAPP_VERIFY_TOKEN` | Meta `hub.verify_token` handshake |
| `WHATSAPP_WEBHOOK_URL` | Documented target for Meta webhook config |
| `WHATSAPP_WELCOME_MESSAGE` | On first inbound when not yet linked |
| `WHATSAPP_CALLBACK_TOKEN` | Optional protect for forwarded `/whatsapp/webhook?token=` |

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
| Proxy up | `GET http://localhost:8089/api/v1/healthz` |
| Meta verify | Webhook subscription succeeds; Nest returns challenge |
| Link | Send CONNECT; row in `whatsapp_connections` |
| Push | Notify with WhatsApp linked (within 24h window) |
| Signature errors | App secret mismatch or body altered before HMAC |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Webhook verify fails | Wrong `WHATSAPP_VERIFY_TOKEN` or Nest not publicly reachable |
| CONNECT never links | Webhook not subscribed to `messages` / Nest not reachable |
| Invalid signature | Wrong `WHATSAPP_APP_SECRET` or raw body middleware missing |
| Send fails with 131047 / window | Outside 24h customer care window — user must message first, or use a template |
| Send fails auth | Invalid access token or phone number ID |
| QR wrong number | Wrong `WHATSAPP_BUSINESS_PHONE` |
| Gateway 401 | Secret mismatch |

---

## Notes vs other channels

| | Telegram | Viber | WhatsApp |
|--|----------|-------|----------|
| Local inbound | `TELEGRAM_POLLING=true` | HTTPS webhook only | HTTPS webhook only |
| Credential headers | `X-Telegram-Bot-Token` | `X-Viber-Auth-Token` | Access token + phone number ID |
| Webhook auth | Shared secret header | HMAC-SHA256 of body | `X-Hub-Signature-256` + verify token GET |
| Deep link | `https://t.me/<bot>` | `viber://pa?chatURI=` | `https://wa.me/<phone>?text=` |
| Messaging window | Open | Open (after subscribe) | **24h** session after user message |
