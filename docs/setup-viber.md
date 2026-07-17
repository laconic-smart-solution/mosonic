# Setup: Viber bot

How to connect Mosonic (neutral-tex) to a Viber Public Account / bot for account linking and notify push.

Related: [LINE](./setup-line.md) · [Telegram](./setup-telegram.md)  
Proxy details: `communication-service/app/viber-service/INTEGRATION.md`

---

## Architecture (Mosonic)

```
User (Viber)  →  Viber  →  Nest /viber/webhook/direct  (HTTPS required)
                             │
                             ├─ CONNECT <code> / deep-link context → link ViberConnection
                             └─ welcome / replies

Nest CommsNotify  →  viber-service (:8088)  →  Viber send_message
                     + X-Viber-Auth-Token
```

Credentials live in **Nest** (`server/.env`), not in viber-service.

**Important:** Viber has **no** long-polling API. Inbound CONNECT always needs a public **HTTPS** webhook (trusted certificate; no self-signed).

---

## Prerequisites

- [Viber Admin Panel](https://partners.viber.com/) bot / Public Account
- Auth token + public account **URI** (`chatURI`)
- Public HTTPS URL to Nest (production or tunnel with a valid cert)
- Go 1.22+ (to run viber-service)
- Nest server + Redis (CONNECT codes)
- `COMMUNICATION_GATEWAY_SECRET` matching viber-service `GATEWAY_SECRET`
- Prisma migration `viber_connections` applied

---

## 1. Create the Viber bot

1. Open the Viber Admin / Partners portal and create a bot / Public Account.
2. Copy:
   - **Authentication token** (API token)
   - **URI** / chat URI used in deep links (`viber://pa?chatURI=...`)
3. Ensure the account can receive `message`, `subscribed`, `conversation_started`, `unsubscribed` events.

---

## 2. Start viber-service

```bat
cd communication-service\app\viber-service
copy .env.example .env
rem set GATEWAY_SECRET=hello
run.bat
```

Health check:

```bash
curl http://localhost:8088/api/v1/healthz
```

Via gateway: `http://localhost:8099/comms/viber/api/v1/healthz`

---

## 3. Configure Nest (`server/.env`)

```env
COMMUNICATION_GATEWAY_SECRET=hello

VIBER_SERVICE_URL=http://localhost:8088
# Or: http://localhost:8099/comms/viber

VIBER_AUTH_TOKEN=<from Viber Admin>
VIBER_URI=<public_account_uri>
VIBER_WELCOME_MESSAGE=Welcome to Mosonic!
VIBER_CALLBACK_TOKEN=
VIBER_WEBHOOK_URL=https://<public-host>/viber/webhook/direct
VIBER_TENANT_ID=00000000-0000-0000-0000-000000000001
VIBER_ACTOR_ID=00000000-0000-0000-0000-000000000002
```

| Variable | Purpose |
|----------|---------|
| `VIBER_SERVICE_URL` | Outbound send + QR |
| `VIBER_AUTH_TOKEN` | Sent as `X-Viber-Auth-Token`; also HMAC key for webhook signatures |
| `VIBER_URI` | QR / `viber://pa?chatURI=` deep link (no `@` required) |
| `VIBER_WEBHOOK_URL` | Target for Viber `set_webhook` |
| `VIBER_WELCOME_MESSAGE` | On subscribed / conversation_started |
| `VIBER_CALLBACK_TOKEN` | Optional protect for forwarded `/viber/webhook?token=` |

Restart Nest after changing env.

---

## 4. Register the webhook (required)

Viber validates the URL with HTTPS when you call `set_webhook`.

**Direct (recommended):**

```
https://<your-public-host>/viber/webhook/direct
```

Nest verifies `X-Viber-Content-Signature` = hex(HMAC-SHA256(`VIBER_AUTH_TOKEN`, raw body)).

Register via Nest `ViberService.setWebhook(url)` (or call Viber API yourself):

```http
POST https://chatapi.viber.com/pa/set_webhook
X-Viber-Auth-Token: <VIBER_AUTH_TOKEN>
Content-Type: application/json

{
  "url": "https://<public>/viber/webhook/direct",
  "event_types": ["subscribed", "unsubscribed", "conversation_started", "message"]
}
```

Local/dev: use a tunnel with a **trusted** certificate (Viber rejects self-signed).

**Via viber-service forwarder (optional):**

```
https://<gateway>/comms/viber/api/v1/webhooks?auth_token=<TOKEN>&callback_url=https://<host>/viber/webhook?token=<VIBER_CALLBACK_TOKEN>
```

---

## 5. User connect flow (UI)

1. **Account settings → Get in touch → Viber → Connect**.
2. Nest returns QR (`viber://pa?chatURI=...`) + `CONNECT <code>` (deep link may also pass context).
3. User opens the PA and sends `CONNECT ABC123` (or opens via deep link with context).
4. Webhook upserts `viber_connections`.
5. Notifies fan out to Viber when linked (with LINE/Telegram if also connected).

---

## 6. Database

Ensure migration applied:

```bash
cd neutral-tex/server
npx prisma migrate deploy
```

Table: `viber_connections` (`userId`, `viberUserId`).

---

## 7. Verify

| Check | How |
|-------|-----|
| Proxy up | `GET http://localhost:8088/api/v1/healthz` |
| set_webhook | Viber returns status `0`; handshake callback returns 200 |
| Link | Send CONNECT; row in `viber_connections` |
| Push | Notify with Viber linked |
| Signature errors | Auth token mismatch or body altered before HMAC |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| set_webhook status 1 / invalidUrl | URL not HTTPS or cert not trusted |
| CONNECT never links | Webhook not set / Nest not reachable publicly |
| Invalid signature | Wrong `VIBER_AUTH_TOKEN` or raw body middleware missing |
| Send fails | Token invalid or user never subscribed to the PA |
| QR wrong bot | Wrong `VIBER_URI` |
| Gateway 401 | Secret mismatch |

---

## Notes vs Telegram

| | Telegram | Viber |
|--|----------|-------|
| Local inbound | `TELEGRAM_POLLING=true` | Not available — need HTTPS webhook |
| Credential header | `X-Telegram-Bot-Token` | `X-Viber-Auth-Token` |
| Webhook auth | Shared secret header | HMAC-SHA256 of body |
| Deep link | `https://t.me/<bot>` | `viber://pa?chatURI=<uri>` |
