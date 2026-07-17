# LINE Integration — Architecture

How neutral-tex talks to LINE. This is the **neutral-tex view**; for the service contract
itself see [`communication-service/app/line-service/INTEGRATION.md`](../../../communication-service/app/line-service/INTEGRATION.md),
and for the browser-facing API see [`line-api.md`](line-api.md).

**Golden rule:** neutral-tex owns the LINE credentials and all business decisions.
`line-service` is a stateless HTTP proxy that owns none of it.

```
neutral-tex  →  line-service  →  LINE
  (state)       (stateless)
```

---

## System context

```
┌──────────────┐
│   Browser    │  session cookie
└──────┬───────┘
       │ GET /line/qr
       ▼
┌────────────────────────────────────────────┐        ┌──────────────────┐
│        neutral-tex server (:3000)          │        │      LINE        │
│                                            │        │                  │
│  LineController      ── JwtAuthGuard       │        │                  │
│  LineWebhookController ── token check      │        │                  │
│  LineService  ◄── owns token + welcome copy│        │                  │
└──────┬─────────────────────────▲───────────┘        └────┬────────▲────┘
       │ X-Gateway-Secret        │ callback_url            │        │
       │ X-Line-Channel-         │ (?token=…)              │ follow │ push
       │   Access-Token          │                         │ event  │
       ▼                         │                         ▼        │
┌────────────────────────────────┴────────────────────────────┐     │
│              line-service (:8083) — stateless, no DB        │─────┘
│  /api/v1/qr              render PNG        (no LINE call)   │
│  /api/v1/messages        push proxy        (token from caller) │
│  /api/v1/messages/batch  multicast proxy   (chunk + rate limit) │
│  /api/v1/webhooks        verify HMAC + forward  (secret from URL) │
└─────────────────────────────────────────────────────────────┘
```

Ownership is the thing to hold onto:

| Owned by neutral-tex | Owned by line-service |
|----------------------|------------------------|
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` | Gateway shared secret |
| Welcome copy, business rules | QR rendering, HMAC verify, HTTP proxy to LINE |
| Which basic ID to show | *(nothing persistent — no DB)* |

Because line-service stores no credentials, rotating a LINE token is a neutral-tex
`.env` change and restart. line-service is not redeployed and not even aware.

---

## Components

| Component | Path | Role |
|-----------|------|------|
| `LineController` | `src/line/line.controller.ts` | `GET /line/qr`, `GET /line/qr.png` — cookie/JWT guarded |
| `LineWebhookController` | `src/line/line-webhook.controller.ts` | `POST /line/webhook` — public, shared-token guarded |
| `LineService` | `src/line/line.service.ts` | The only place that holds the LINE token; proxies to line-service, reacts to events |
| `LineConnectionService` | `src/line/line-connection.service.ts` | Prisma `line_connections` (stores `lineUserId`) |
| `AdminLineController` | `src/admin/controllers/admin-line.controller.ts` | Admin list / 1:1 send / global announcement |
| DTOs / types | `src/line/dto/line.dto.ts`, `src/line/line.types.ts` | Validation + event shapes |
| `line-service` | `communication-service/app/line-service/` | Go/Fiber proxy on `:8083` |

---

## Flow 1 — Show the add-friend QR

```
1. Browser      GET /line/qr            (session cookie)
2. LineService  GET :8083/api/v1/qr?basic_id=@136laxkx&format=json
                  + X-Gateway-Secret
3. line-service render PNG from https://line.me/R/ti/p/%40136laxkx
4. Browser      <img src={qrImage} />  → user scans → LINE profile → "Add friend"
```

No LINE API is involved: the QR just encodes a public URL. Nothing here is per-user,
so the response is cacheable (`max-age=86400`) and safe to fetch once.

## Flow 2 — Auto-greet on friend add

**There is no "accept" step.** LINE has no accept-friend API; a follow is instant and
unilateral. The only thing to automate is the greeting.

```
1. User         taps "Add friend" in LINE
2. LINE         POST /api/v1/webhooks?channel_secret=…&callback_url=…  + X-Line-Signature
3. line-service verify HMAC-SHA256 with channel_secret from the URL
                parse events → {type:"follow", user_id, reply_token}
4. line-service POST <callback_url>  → neutral-tex  (no auth header! see below)
5. neutral-tex  200 {received:true} immediately; greeting runs fire-and-forget
6. LineService  POST :8083/api/v1/messages + X-Line-Channel-Access-Token
7. line-service push message → LINE → user sees the welcome
```

Step 5 matters: the callback returns `200` **before** the greeting completes. A slow or
failing LINE push must never make line-service think the callback failed. Greeting errors
are logged and swallowed per-event, so one bad user ID cannot halt a batch.

Steps 6–7 are why the welcome lives here rather than in line-service: replying inline
would force line-service to hold the channel access token, breaking the stateless
contract for the sake of one round trip.

## Flow 3 — Outbound message

`LineService.sendText()` → `POST :8083/api/v1/messages`. Used by Flow 2 and admin
one-to-one send (`POST /admin/line/connections/:userId/messages`).

## Flow 4 — Global announcement (admin)

Broadcast the same text to every Mosonic user who has linked LINE
(`line_connections.lineUserId`).

```
1. Admin        POST /admin/line/announcements  { "text": "…" }  (JWT + AdminGuard)
2. Nest         SELECT lineUserId FROM line_connections
3. LineService  POST :8083/api/v1/messages/batch
                  + X-Gateway-Secret + X-Line-Channel-Access-Token
                  body: { recipient_ids, text }
4. line-service chunk 500 → LINE Multicast API
                  min interval between chunks + 429 backoff
5. Admin        { total, sent, failed, chunkCount, failedRecipientIds }
```

neutral-tex owns the recipient list; line-service stays stateless. No announcement
history is persisted in this pass — the response is the delivery summary only.

---

## Why neutral-tex bypasses the comms gateway

`LINE_SERVICE_URL` points **straight at `line-service:8083`**, not at the gateway
(`:8099/comms/line`). This looks like it violates the "always go through the gateway"
rule, so the reason is worth writing down:

The comms gateway authenticates `/comms/*/api/v1/**` with a JWT it verifies using its own
**HMAC secret** (`GATEWAY_JWT_HMAC_SECRET`, `SecurityConfig.java`). neutral-tex's sessions
are **RS256 tokens from authorize-server, verified via remote JWKS** (`jwt-auth.guard.ts`).
Those are two different trust domains — a neutral-tex user token is not a valid gateway
token, and the gateway would reject it.

Worse, the gateway derives `X-Actor-ID`/`X-Tenant-ID` from *its* JWT claims
(`IdentityHeaderFilter.java`), and Flow 2 has no user JWT at all — it is triggered by LINE,
not by a signed-in human.

So neutral-tex authenticates to line-service the way the contract allows for
server-to-server callers: `X-Gateway-Secret` plus explicit `X-Tenant-ID` / `X-Actor-ID`
headers it sets itself. **This requires that `:8083` is not publicly reachable** — it must
sit on the internal network, since the shared secret is the only thing in front of it.

Routing through the gateway would require issuing neutral-tex a gateway-HMAC service
token. That's a real option if the boundary ever needs to harden; it just isn't built.

---

## Trust boundaries

| Hop | Protected by |
|-----|--------------|
| Browser → neutral-tex | Session cookie (`SameSite=Lax`), `JwtAuthGuard` |
| neutral-tex → line-service | `X-Gateway-Secret`, constant-time compare; internal network only |
| LINE → line-service | HMAC-SHA256 `X-Line-Signature` vs `channel_secret` from the URL |
| line-service → neutral-tex | **Shared token on the `callback_url` query string** |
| line-service → LINE | `X-Line-Channel-Access-Token` supplied per request |

That fourth row is the sharp edge. line-service sends **no auth header** on its callback,
so without a token on the URL, `POST /line/webhook` would be an open endpoint that anyone
could use to make us message arbitrary LINE users. `LINE_CALLBACK_TOKEN` closes that, with
a `timingSafeEqual` compare.

Consequence: the webhook URL registered in the LINE Console embeds **two secrets** — the
channel secret and the callback token. Treat that URL as a credential; HTTPS only.

```
https://<gateway-host>/comms/line/api/v1/webhooks
  ?channel_secret=<CHANNEL_SECRET>
  &callback_url=https%3A%2F%2F<host>%2Fline%2Fwebhook%3Ftoken%3D<LINE_CALLBACK_TOKEN>
```

Inbound webhooks *do* come through the gateway — `/comms/*/api/v1/webhooks` is
`permitAll()`, and LINE needs one stable public HTTPS URL.

---

## Configuration

| Variable | Purpose |
|----------|---------|
| `LINE_SERVICE_URL` | line-service base URL (default `http://localhost:8083`) |
| `COMMUNICATION_GATEWAY_SECRET` | Must equal `GATEWAY_SECRET` in line-service |
| `LINE_CHANNEL_ACCESS_TOKEN` | From LINE Console. **Only** neutral-tex holds it |
| `LINE_CHANNEL_SECRET` | Registered on the webhook URL, not sent per request |
| `LINE_BASIC_ID` | OA the QR points at (`@136laxkx`) |
| `LINE_WELCOME_MESSAGE` | Greeting copy; changing it needs no code change |
| `LINE_CALLBACK_TOKEN` | Guards `POST /line/webhook` |
| `LINE_TENANT_ID`, `LINE_ACTOR_ID` | Identity headers we set ourselves (must be UUIDs) |

`callback_url` **must be HTTPS** (line-service rejects otherwise), so local testing needs
the ngrok tunnel (`yarn start:tunnel`) — `http://localhost:3000` will not work.

---

## Failure modes

| Failure | Behavior | Blast radius |
|---------|----------|--------------|
| line-service down | QR endpoints `503`; greetings logged + dropped | QR unavailable; the follow is still real, user just isn't greeted |
| `LINE_CHANNEL_ACCESS_TOKEN` unset/invalid | `503` on send; QR **still works** (needs no token) | Greetings only |
| Bad `size` | `400` from our DTO, before line-service is called | Caller only |
| Bad `basicId` | line-service `400`, surfaced as `400` (not `503` — it's a caller error) | Caller only |
| Wrong callback token | `401`; no message sent | Blocks forgeries |
| LINE rate limit | LINE `429` → line-service `400 line rate limit exceeded` → logged | Greeting dropped for that user |

Greetings are **fire-and-forget with no retry or dedupe**. A missed welcome is silently
lost, and a LINE webhook redelivery would send a duplicate. That is an accepted trade for
a greeting; it would not be acceptable for anything transactional. Anything that must not
be lost needs a queue (BullMQ is already in the stack) — see below.

---

## Known gaps

Deliberately not built. Each needs a decision, not just code:

- **No follow state.** We never persist who followed. So there's no "is this user a
  friend?" check, no unfollow bookkeeping (the `unfollow` event is forwarded and
  currently ignored), and no way to link a LINE `userId` to a neutral-tex user. That
  linkage is the prerequisite for any real LINE feature beyond a greeting.
- **Single account.** One token, one basic ID, from env. Per-tenant LINE accounts would
  mean moving credentials into the database and passing them per request — which the
  stateless line-service contract already supports.
- **`X-Actor-ID` is a fixed placeholder.** Fine for system-initiated pushes; revisit if
  sends ever need attribution to a real user.
- **No delivery guarantees.** See above.

---

## Related docs

`communication-service` is a **separate repo**, checked out as a sibling of `neutral-tex/`.
The links below resolve in a local editor with that layout; they will not resolve on GitHub.

- [`line-api.md`](line-api.md) — frontend API guide
- [`INTEGRATION.md`](../../../communication-service/app/line-service/INTEGRATION.md) — line-service contract
- [`ARCHITECTURE.md`](../../../communication-service/docs/ARCHITECTURE.md) — communication-service overview
- [`API_GATEWAY.md`](../../../communication-service/docs/API_GATEWAY.md) — gateway routing and auth
