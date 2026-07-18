# Setup: LINE messaging

How to connect Mosonic (neutral-tex) to LINE Official Account for account linking and notify push.

Related: [Telegram](./setup-telegram.md) · [Viber](./setup-viber.md)  
Proxy details: `communication-service/app/line-service/INTEGRATION.md`

---

## Architecture (Mosonic)

```
User (LINE app)  →  LINE Platform  →  Nest /line/webhook/direct
                                        │
                                        ├─ CONNECT <code> → link LineConnection
                                        └─ welcome / replies

Nest CommsNotify  →  line-service (:8083)  →  LINE push API
                     + X-Line-Channel-Access-Token
```

Credentials live in **Nest** (`server/.env`), not in line-service.

---

## Prerequisites

- LINE Developers Console account
- Messaging API channel (Official Account)
- Go 1.22+ (to run line-service)
- Nest server + Redis (CONNECT codes)
- `COMMUNICATION_GATEWAY_SECRET` matching line-service `GATEWAY_SECRET`

---

## 1. Create the LINE channel

1. Open [LINE Developers Console](https://developers.line.biz/console/).
2. Create a **Messaging API** channel (or use an existing OA).
3. Copy:
   - **Channel secret**
   - **Channel access token** (long-lived)
4. Note the OA **Basic ID** (e.g. `@136laxkx`) for QR / add-friend links.

---

## 2. Start line-service

From the monorepo:

```bat
cd communication-service\app\line-service
copy .env.example .env
rem set GATEWAY_SECRET=hello  (must match Nest COMMUNICATION_GATEWAY_SECRET)
run.bat
```

Health check:

```bash
curl http://localhost:8083/api/v1/healthz
```

Via gateway (optional): `http://localhost:8099/comms/line/api/v1/healthz`

---

## 3. Configure Nest (`server/.env`)

```env
COMMUNICATION_GATEWAY_SECRET=hello

LINE_SERVICE_URL=http://localhost:8083
# Or via gateway: http://localhost:8099/comms/line

LINE_CHANNEL_ACCESS_TOKEN=<from LINE Console>
LINE_CHANNEL_SECRET=<from LINE Console>
LINE_BASIC_ID=@your_oa_basic_id
LINE_WELCOME_MESSAGE=Welcome to Mosonic!
LINE_CALLBACK_TOKEN=
LINE_TENANT_ID=00000000-0000-0000-0000-000000000001
LINE_ACTOR_ID=00000000-0000-0000-0000-000000000002
```

| Variable | Purpose |
|----------|---------|
| `LINE_SERVICE_URL` | Outbound send + QR via line-service |
| `LINE_CHANNEL_ACCESS_TOKEN` | Sent as `X-Line-Channel-Access-Token` on each push |
| `LINE_CHANNEL_SECRET` | Verify inbound webhook signatures (direct mode) |
| `LINE_BASIC_ID` | Add-friend QR |
| `LINE_WELCOME_MESSAGE` | Sent on follow / friend add |
| `LINE_CALLBACK_TOKEN` | Optional; protect forwarded `/line/webhook?token=` |

Restart Nest after changing env.

---

## 4. Register the webhook (inbound)

LINE must reach Nest over HTTPS in production.

**Direct (recommended for Mosonic):**

```
https://<your-public-host>/line/webhook/direct
```

In LINE Console → Messaging API → Webhook URL → set that URL → **Verify** → enable webhook.

Local/dev: use a tunnel (ngrok, Cloudflare Tunnel, etc.) pointing at Nest’s HTTP port.

**Via line-service forwarder (optional):**

```
https://<gateway>/comms/line/api/v1/webhooks?channel_secret=<SECRET>&callback_url=https://<host>/line/webhook?token=<LINE_CALLBACK_TOKEN>
```

---

## 5. User connect flow (UI)

1. User opens **Account settings → Get in touch → LINE → Connect**.
2. Nest issues a Redis `CONNECT <code>` (TTL ~10 minutes) + QR.
3. User adds the OA (scan QR) and sends exactly: `CONNECT ABC123`.
4. Webhook handles the message → upserts `line_connections` → Nest replies “Connected successfully…”.
5. Later notifies (pipeline, schedule, credits) fan out via `CommsNotifyService` → LINE if linked.

---

## 6. Verify

| Check | How |
|-------|-----|
| Proxy up | `GET http://localhost:8083/api/v1/healthz` |
| Nest env | Missing token → send fails with clear error in logs |
| Webhook | LINE Console “Verify” succeeds |
| Link | Send `CONNECT <code>` from settings; DB row in `line_connections` |
| Push | Trigger a pipeline complete / schedule notify with LINE linked |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| QR / send “unreachable” | line-service not running or wrong `LINE_SERVICE_URL` |
| Webhook verify fails | Wrong URL, Nest not public HTTPS, or raw body / signature mismatch |
| CONNECT ignored | Webhook not enabled, or Nest not receiving events |
| Invalid signature | `LINE_CHANNEL_SECRET` mismatch |
| Gateway 401 | `GATEWAY_SECRET` ≠ `COMMUNICATION_GATEWAY_SECRET` |
