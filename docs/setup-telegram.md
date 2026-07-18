# Setup: Telegram bot

How to connect Mosonic (neutral-tex) to a Telegram bot for account linking and notify push.

Related: [LINE](./setup-line.md) · [Viber](./setup-viber.md)  
Proxy details: `communication-service/app/telegram-service/INTEGRATION.md`

---

## Architecture (Mosonic)

```
User (Telegram)  →  Telegram  →  Nest (polling getUpdates  OR  /telegram/webhook/direct)
                                   │
                                   ├─ CONNECT <code> → link TelegramConnection
                                   └─ welcome / replies

Nest CommsNotify  →  telegram-service (:8087)  →  Telegram sendMessage
                     + X-Telegram-Bot-Token
```

Credentials live in **Nest** (`server/.env`), not in telegram-service.

---

## Prerequisites

- Telegram account + [@BotFather](https://t.me/BotFather)
- Go 1.22+ (to run telegram-service)
- Nest server + Redis (CONNECT codes)
- `COMMUNICATION_GATEWAY_SECRET` matching telegram-service `GATEWAY_SECRET`

---

## 1. Create the bot

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Copy the **bot token**.
3. Note the **bot username** (e.g. `mosonic_development_bot`).
4. Optional: set a description / about text in BotFather.

---

## 2. Start telegram-service

```bat
cd communication-service\app\telegram-service
copy .env.example .env
rem set GATEWAY_SECRET=hello
run.bat
```

Health check:

```bash
curl http://localhost:8087/api/v1/healthz
```

Via gateway: `http://localhost:8099/comms/telegram/api/v1/healthz`

---

## 3. Configure Nest (`server/.env`)

```env
COMMUNICATION_GATEWAY_SECRET=hello

TELEGRAM_SERVICE_URL=http://localhost:8087
# Or: http://localhost:8099/comms/telegram

TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_BOT_USERNAME=mosonic_development_bot
TELEGRAM_WEBHOOK_SECRET=<random secret for setWebhook>
TELEGRAM_WELCOME_MESSAGE=Welcome to Mosonic!
TELEGRAM_CALLBACK_TOKEN=
TELEGRAM_TENANT_ID=00000000-0000-0000-0000-000000000001
TELEGRAM_ACTOR_ID=00000000-0000-0000-0000-000000000002

# Local/dev (no public HTTPS): Nest long-polls getUpdates
TELEGRAM_POLLING=true
TELEGRAM_WEBHOOK_URL=

# Production: disable polling and set a public webhook
# TELEGRAM_POLLING=false
# TELEGRAM_WEBHOOK_URL=https://<public>/telegram/webhook/direct
```

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_SERVICE_URL` | Outbound send + QR |
| `TELEGRAM_BOT_TOKEN` | Sent as `X-Telegram-Bot-Token` |
| `TELEGRAM_BOT_USERNAME` | QR / `t.me` deep link |
| `TELEGRAM_WEBHOOK_SECRET` | Matches Telegram `secret_token` / header |
| `TELEGRAM_POLLING` | `true` for local CONNECT without a public URL |
| `TELEGRAM_WEBHOOK_URL` | Production HTTPS webhook |

Restart Nest after changing env. With `TELEGRAM_POLLING=true`, Nest should log that the polling bridge is active.

---

## 4. Inbound: polling vs webhook

### Local / dev — polling (recommended)

Set `TELEGRAM_POLLING=true`. Nest calls Telegram `getUpdates` and handles CONNECT without exposing Nest to the internet.

Do **not** also register a webhook while polling (Telegram allows only one inbound mode).

### Production — webhook

1. Set `TELEGRAM_POLLING=false`.
2. Set `TELEGRAM_WEBHOOK_URL=https://<public>/telegram/webhook/direct`.
3. Nest (or your deploy hook) should call Telegram `setWebhook` with:
   - `url` = that HTTPS URL  
   - `secret_token` = `TELEGRAM_WEBHOOK_SECRET`  
   Telegram then sends `X-Telegram-Bot-Api-Secret-Token`.

**Via telegram-service forwarder (optional):**

```
https://<gateway>/comms/telegram/api/v1/webhooks?secret_token=<SECRET>&callback_url=https://<host>/telegram/webhook?token=<TELEGRAM_CALLBACK_TOKEN>
```

---

## 5. User connect flow (UI)

1. **Account settings → Get in touch → Telegram → Connect**.
2. Nest returns QR + `CONNECT <code>`.
3. User opens the bot (scan QR / `t.me/...`) and sends `CONNECT ABC123` (or `/start` then CONNECT).
4. Polling or webhook consumes the code → `telegram_connections` row.
5. Notifies fan out to Telegram when linked.

---

## 6. Verify

| Check | How |
|-------|-----|
| Proxy up | `GET http://localhost:8087/api/v1/healthz` |
| Polling | Nest log: scheduler/polling listening; send CONNECT in Telegram |
| Webhook | `getWebhookInfo` shows your URL; secret header verified |
| Link | Row in `telegram_connections` |
| Push | Schedule / pipeline notify with Telegram linked |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| CONNECT never replies (local) | `TELEGRAM_POLLING` not `true`, or Nest not restarted |
| Webhook works but polling doesn’t | Webhook still registered — delete webhook or disable polling conflict |
| “Invalid or expired CONNECT code” | Code TTL (~10 min) expired — generate a new one in settings |
| Send fails | Wrong `TELEGRAM_BOT_TOKEN` or telegram-service down |
| Gateway 401 | Secret mismatch |
