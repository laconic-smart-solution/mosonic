# Setup: WeChat Official Account messaging

How to connect Mosonic (neutral-tex) to a WeChat **Official Account (公众号 / Service Account)** for account linking and notify push.

This is **not** WeCom (企业微信) or Mini Program — those use different APIs.

Related: [LINE](./setup-line.md) · [Telegram](./setup-telegram.md) · [Viber](./setup-viber.md) · [WhatsApp](./setup-whatsapp.md)  
Proxy setup: [`communication-service/app/wechat-service/SETUP.md`](../../communication-service/app/wechat-service/SETUP.md) · contract: [`INTEGRATION.md`](../../communication-service/app/wechat-service/INTEGRATION.md)

---

## Constraints

- Free-form **customer service** send (`message/custom/send`) only works inside WeChat’s interaction window (typically **48 hours** after the user messages you or certain events).
- Requires a registered OA with **AppID / AppSecret** and a **public HTTPS** webhook.
- China WeChat API (`api.weixin.qq.com`); your Nest / wechat-service host must reach WeChat.

---

## Architecture (Mosonic)

```
User (WeChat)  →  WeChat OA servers  →  Nest /wechat/webhook/direct  (XML)
                                          │
                                          ├─ CONNECT <code> / subscribe|SCAN scene → link wechat_connections
                                          └─ welcome reply

Nest CommsNotify  →  wechat-service (:8090)  →  cgi-bin/message/custom/send
                     + X-WeChat-Access-Token
```

Credentials live in **Nest** (`server/.env`). Nest caches `access_token` and sends it to wechat-service; the Go proxy is stateless.

---

## Prerequisites

- WeChat Official Account (服务号 preferred for richer APIs; 订阅号 may be limited)
- Access to [微信公众平台](https://mp.weixin.qq.com/)
- Go 1.22+ (to run wechat-service)
- Nest server + Redis (CONNECT codes)
- `COMMUNICATION_GATEWAY_SECRET` matching wechat-service `GATEWAY_SECRET`
- Server that can call `api.weixin.qq.com`

---

## 1. Create / configure the Official Account

1. Open 微信公众平台 → your OA → **开发** → **基本配置**.
2. Copy **AppID** and **AppSecret**.
3. Under **服务器配置** (or 开发者中心 → 服务器配置):
   - Set URL to Nest webhook (see §4)
   - Set **Token** (arbitrary string; same as `WECHAT_TOKEN`)
   - Encoding mode: **明文** (plain) is enough for Mosonic; optional safe mode needs `WECHAT_ENCODING_AES_KEY` (not required for basic CONNECT)
4. Note the OA **微信号 / username** for fallback deep links (`WECHAT_OA_USERNAME`).

---

## 2. Start wechat-service

From the monorepo:

```bat
cd communication-service\app\wechat-service
copy .env.example .env
rem set GATEWAY_SECRET=hello  (must match Nest COMMUNICATION_GATEWAY_SECRET)
run.bat
```

Health check:

```bash
curl http://localhost:8090/api/v1/healthz
```

Via gateway (optional): `http://localhost:8099/comms/wechat/api/v1/healthz`

Docker Compose includes `wechat-service` on port **8090** and gateway route `/comms/wechat/**`.

---

## 3. Configure Nest (`server/.env`)

```env
COMMUNICATION_GATEWAY_SECRET=hello

WECHAT_SERVICE_URL=http://localhost:8090
# Or via gateway: http://localhost:8099/comms/wechat

WECHAT_APP_ID=<from 公众平台>
WECHAT_APP_SECRET=<from 公众平台>
WECHAT_TOKEN=<same as OA server config Token>
WECHAT_OA_USERNAME=<optional OA username for fallback QR>
WECHAT_WELCOME_MESSAGE=Welcome to Mosonic!
WECHAT_CALLBACK_TOKEN=
# Optional (safe mode encrypt/decrypt — not required for plain mode):
# WECHAT_ENCODING_AES_KEY=
WECHAT_TENANT_ID=00000000-0000-0000-0000-000000000001
WECHAT_ACTOR_ID=00000000-0000-0000-0000-000000000002
```

| Variable | Purpose |
|----------|---------|
| `WECHAT_SERVICE_URL` | Outbound send + scene QR via wechat-service |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | Nest fetches and caches `access_token` |
| `WECHAT_TOKEN` | Verify inbound webhook signature (SHA1) |
| `WECHAT_OA_USERNAME` | Fallback OA deep-link when scene QR fails |
| `WECHAT_WELCOME_MESSAGE` | Sent on subscribe (follow) |
| `WECHAT_CALLBACK_TOKEN` | Optional; protect forwarded `/wechat/webhook?token=` |

Run Prisma migration so `wechat_connections` exists, then restart Nest.

---

## 4. Register the webhook (inbound)

WeChat must reach Nest over **HTTPS** in production.

**Direct (recommended for Mosonic):**

```
https://<your-public-host>/wechat/webhook/direct
```

- **GET**: WeChat sends `signature`, `timestamp`, `nonce`, `echostr` — Nest verifies with `WECHAT_TOKEN` and echoes `echostr`.
- **POST**: XML body (`MsgType` text / event `subscribe` | `SCAN`).

Local/dev: use a tunnel (ngrok, Cloudflare Tunnel, etc.) pointing at Nest’s HTTP port.

**Via wechat-service forwarder (optional):**

```
https://<gateway>/comms/wechat/api/v1/webhooks?callback_url=https://<host>/wechat/webhook?token=<WECHAT_CALLBACK_TOKEN>
```

Pass `X-WeChat-Token` (and optional encoding AES key) as required by wechat-service `INTEGRATION.md`.

---

## 5. User connect flow (UI)

1. User opens **Account settings → Get in touch → WeChat → Connect**.
2. Nest issues a Redis `CONNECT <code>` (TTL ~10 minutes) + **temporary scene QR** (`scene_str` = `CONNECT <code>`).
3. User either:
   - Scans the scene QR (subscribe / SCAN event links automatically), or
   - Follows the OA and sends exactly: `CONNECT ABC123`
4. Webhook upserts `wechat_connections` (OpenID ↔ userId).
5. Later notifies (pipeline, schedule, credits) fan out via `CommsNotifyService` → WeChat if linked — **only if still inside the ~48h customer-service window**.

---

## 6. Verify

| Check | How |
|-------|-----|
| Proxy up | `GET http://localhost:8090/api/v1/healthz` |
| Nest env | Missing AppID/Secret → token fetch fails with clear error in logs |
| Webhook | OA admin “提交” / verify succeeds (GET echostr) |
| Link | Send `CONNECT <code>` or scan scene QR; DB row in `wechat_connections` |
| Push | Trigger a notify with WeChat linked **after** a user message (within 48h) |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| QR / send “unreachable” | wechat-service not running or wrong `WECHAT_SERVICE_URL` |
| Webhook verify fails | Wrong Token, Nest not public HTTPS, or signature mismatch |
| CONNECT ignored | Webhook not enabled, wrong URL, or Nest not receiving XML |
| Notify fails with API error | Outside 48h window, or user never messaged / event not opening window |
| `access_token` invalid | Wrong AppID/Secret, or IP whitelist on OA if enabled |
| Gateway 401 | `GATEWAY_SECRET` ≠ `COMMUNICATION_GATEWAY_SECRET` |

---

## Out of scope

- WeCom / Mini Program
- Template messages / mass broadcast (Mosonic notify uses customer-service text only)
- Zernio WeChat publish
