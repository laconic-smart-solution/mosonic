# LINE API — Frontend Guide

Endpoints for showing a **LINE add-friend QR code**. Scanning it opens the official
account profile (`@136laxkx` by default) in the LINE app, where the user taps **Add friend**.

Everything else in the LINE integration is server-side. See [What you do NOT need to build](#what-you-do-not-need-to-build).

- **Base URL:** `VITE_API_BASE_URL` (local: `http://localhost:3000`)
- **Auth:** the normal session cookie — same as every other endpoint. Use the shared
  `apiClient` (`withCredentials: true`) and it just works.

---

## Endpoints

| Method | Path | Returns | Use when |
|--------|------|---------|----------|
| `GET` | `/line/qr` | JSON + base64 PNG data URI | **Default.** Rendering in React |
| `GET` | `/line/qr.png` | Raw `image/png` | You want a plain `<img src>` with no JS |

Both accept the same query params:

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `basicId` | string | no | `@136laxkx` (server env) | Omit this unless you're targeting a different OA. A missing `@` is added for you. |
| `size` | int | no | `256` | PNG width/height in px, **64–1024** |

> Unknown query params are **rejected with 400** (`forbidNonWhitelisted`), so don't
> append cache-busters like `?t=123`.

### `GET /line/qr`

```http
GET /line/qr?size=300
```

```json
{
  "basicId": "@136laxkx",
  "addFriendUrl": "https://line.me/R/ti/p/%40136laxkx",
  "qrImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

| Field | Description |
|-------|-------------|
| `basicId` | Normalized OA basic ID |
| `addFriendUrl` | The URL encoded **inside** the QR. Also use it for a tappable "Add on LINE" button on mobile, where scanning is impossible. |
| `qrImage` | PNG as a data URI — drop straight into `<img src={qrImage} />` |

### `GET /line/qr.png`

Responds `image/png` with `Cache-Control: public, max-age=86400`.

```html
<img src="http://localhost:3000/line/qr.png?size=300" alt="Add us on LINE" />
```

**Caveat:** an `<img>` request bypasses the axios interceptor that silently refreshes an
expired session. If the access token has expired, the user sees a broken image instead of
a refresh-and-retry. Prefer `/line/qr` in the app; keep `qr.png` for emails, static pages,
or quick manual checks.

---

## Types

```ts
export type LineQrCode = {
  basicId: string
  addFriendUrl: string
  qrImage: string
}
```

## API module

Matches the existing feature-api convention (`src/features/*/api/*.api.ts`):

```ts
import apiClient from "@/shared/api/api-client"

import type { LineQrCode } from "../types/line.types"

export const lineApi = {
  getQrCode: (params?: { basicId?: string; size?: number }) =>
    apiClient.get<LineQrCode>("/line/qr", { params }).then((r) => r.data),
}
```

## Component

```tsx
import { useEffect, useState } from "react"

import { lineApi } from "../api/line.api"
import type { LineQrCode } from "../types/line.types"

export function LineAddFriendQr() {
  const [qr, setQr] = useState<LineQrCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    lineApi
      .getQrCode({ size: 300 })
      .then(setQr)
      .catch(() => setError("Could not load the LINE QR code."))
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!qr) return <p>Loading…</p>

  return (
    <figure>
      <img src={qr.qrImage} alt={`LINE add-friend QR code for ${qr.basicId}`} width={300} height={300} />
      <figcaption>
        Scan to add {qr.basicId} on LINE, or{" "}
        {/* On mobile the camera can't scan the screen it's rendering — link out instead. */}
        <a href={qr.addFriendUrl} target="_blank" rel="noopener noreferrer">
          open LINE directly
        </a>
        .
      </figcaption>
    </figure>
  )
}
```

The QR is **static** per `basicId`/`size` — fetch it once and cache it. There's no
per-user or per-session data in it, and nothing to poll or refresh.

---

## Errors

Standard error envelope. Note `message` is a **string or an array of strings** —
validation failures return arrays, so normalize before rendering:

```ts
const text = Array.isArray(body.message) ? body.message.join(", ") : body.message
```

| Status | `error` | Example `message` | Cause |
|--------|---------|-------------------|-------|
| `400` | `Bad Request` | `"basic_id must look like @136laxkx"` | Malformed `basicId` |
| `400` | `Bad Request` | `["size must not be greater than 1024"]` | `size` outside 64–1024 |
| `400` | `Bad Request` | `["property bogus should not exist"]` | Unknown query param |
| `401` | `Unauthorized` | `"Missing access token"` | No/expired session — `apiClient` retries after refresh, then redirects to login |
| `503` | `Service Unavailable` | `"line-service is unreachable"` | line-service is down, or the server is missing `LINE_CHANNEL_ACCESS_TOKEN` |

A `503` here is a backend/infra problem, not a user mistake. Show a retry affordance
rather than a validation-style message.

```json
{ "statusCode": 400, "error": "Bad Request", "message": "basic_id must look like @136laxkx" }
```

---

## Admin — global announcement (backend)

Admin-only broadcast to every connected LINE user. Not used by the end-user app UI yet.

| Method | Path | Auth | Body |
|--------|------|------|------|
| `POST` | `/admin/line/announcements` | Admin JWT | `{ "text": "…" }` (1–5000 chars) |

**Behavior:** Nest loads all `lineUserId` values from `line_connections`, then calls
line-service `POST /api/v1/messages/batch` (LINE Multicast, chunked + rate-limited).

**Success:**

```json
{
  "success": true,
  "total": 42,
  "sent": 42,
  "failed": 0,
  "chunkCount": 1,
  "failedRecipientIds": []
}
```

If nobody is connected, returns `total: 0` / `sent: 0` without calling line-service.

Related admin endpoints:

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/admin/line/connections` | Paginated list of linked users |
| `POST` | `/admin/line/connections/:userId/messages` | Send text to one linked user |

---

## What you do NOT need to build

- **Accepting friend requests.** LINE has no accept API — adding a friend is instant and
  unilateral. There is no pending state and no approval UI to build.
- **The welcome message.** When a user adds the OA, LINE fires a `follow` event to the
  backend, which auto-sends the welcome message. It is server-to-server and never touches
  the browser. The copy lives in the `LINE_WELCOME_MESSAGE` env var, not in the frontend.
- **`POST /line/webhook`.** Backend-only callback, protected by a shared token. Never call
  it from the client.

There is currently **no endpoint to check whether a given user added the OA** — LINE
identifies users by an opaque per-channel `userId` that the browser never sees, so the QR
flow is fire-and-forget from the frontend's perspective. If you need "did they add us yet?"
in the UI, that needs a backend change first (persisting `follow` events against a user),
so raise it with the backend team rather than working around it client-side.

---

## Local setup

The QR endpoints need line-service running alongside the API:

```bash
# from communication-service/
GATEWAY_SECRET=hello go run ./app/line-service/cmd   # :8083
```

Server `.env` needs `LINE_SERVICE_URL`, `COMMUNICATION_GATEWAY_SECRET`, and
`LINE_CHANNEL_ACCESS_TOKEN`. Without them the QR endpoints return `503`.
See `app/line-service/INTEGRATION.md` for the backend contract.
