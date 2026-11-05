# Plan: Medium.com integration (Mosonic / neutral-tex)

**Status:** Planning only — no implementation yet  
**Product:** Mosonic (`neutral-tex`)  
**Target:** [Medium](https://medium.com/) as a **publishing / distribution** channel  
**Date:** 2026-09-03

---

## 1. Goal

Let Mosonic users:

1. **Connect** a Medium account (or publication) under Settings → Accounts  
2. **Distribute** workflow / upload content to Medium (draft or publish)  
3. See **status** (connected, last publish, failure / session expired) like other channels  

This is **not** a messenger/notify channel (unlike LINE / Telegram / WeChat). Medium is article syndication, same family as LinkedIn / Facebook / RedNote.

---

## 2. Critical constraint (must decide first)

Medium’s official REST API (`https://api.medium.com/v1`) is **closed to new integrations**:

- Docs repo archived (2023); Medium states they do **not** allow new API integrations  
- Legacy self-issued tokens / OAuth may still work for **old** apps only  
- **New Mosonic builds cannot rely on official OAuth + `POST /v1/users/.../posts`**

So the plan has **three viable strategies**. Pick one before coding.

| Option | Approach | Pros | Cons | Fits Mosonic pattern |
|--------|----------|------|------|----------------------|
| **A. Zernio** | If Zernio (or another aggregator) already supports Medium | Reuse unlock → OAuth → sync → publish | Depends on vendor; may not exist | Same as LinkedIn / IG |
| **B. Browser session (recommended if no Zernio)** | Puppeteer/Playwright + encrypted cookies, like RedNote | Works without official API; full editor control | Fragile UI; Chromium ops; ToS / bot risk | Same as RedNote |
| **C. Manual / assist** | Generate Medium-friendly Markdown + “Open import” deep link / clipboard | Low risk, no scraping | Not auto-publish | Partial UX only |
| **D. Legacy token** | User pastes old Integration Token | Simple if user has one | Almost nobody can mint new tokens; unsupported | Custom Nest module |

**Recommendation:**  

1. **Confirm with Zernio** whether `medium` exists as a platform (Option A).  
2. If no → implement **Option B** (RedNote-style), with Option C as MVP fallback for draft export.  
3. Do **not** build a `communication-service/app/medium-service` Go proxy.

---

## 3. What Medium is in Mosonic terms

| Mosonic concept | Medium mapping |
|-----------------|----------------|
| Distribution channel id | `medium` |
| Account connect | Medium user (and optionally a Publication) |
| Publish unit | Story (title + body HTML/Markdown + tags + canonical URL + publishStatus) |
| Draft vs live | Medium `draft` / `public` / `unlisted` (API era) or editor Publish / Save draft (browser era) |
| Media | Cover / inline images (upload or URL) |

**Out of scope (v1):**  
- Reading Medium DMs / comments as a notify channel  
- Clap / follow automation  
- Multi-author publication admin beyond “post as publication X”  
- Paywall / Partner Program analytics  

---

## 4. Architecture options (detail)

### 4.1 Option A — Zernio (preferred if available)

```text
Client Settings → unlock medium → POST /zernio/connect/medium
  → OAuth → GET /zernio/callback → sync accounts
Upload / workflow → ZernioRestClient.publishCreatePost({ channel: "medium", ... })
Webhook → existing POST /webhooks/zernio
```

**Touch points:**

| Layer | Change |
|-------|--------|
| Zernio vendor | Medium platform enabled |
| Server | Add `medium` to `DISTRIBUTION_CHANNELS` / upload partition (if needed) |
| Client | Entry in `ACCOUNT_CHANNELS` + i18n |
| Docs | `docs/setup-medium.md` (Zernio path) |

**Effort:** Small if vendor-ready; blocked if not.

---

### 4.2 Option B — Custom Medium module (RedNote pattern)

Mirror `server/src/rednote/` + `server/docs/rednote-chromium.md`.

```text
Connect:
  Client → POST /medium/connect/start → QR or email/password browser login
       → poll status → store encrypted session cookies on user metadata / medium_connections

Publish:
  Upload partition (like RedNote) → MediumPublishWorker
       → Chromium: new story → fill title/body/tags → draft or publish
       → store external URL / story id on post row

Health:
  Session validity check before publish; surface “reconnect Medium” on failure
```

**Proposed packages:**

```text
neutral-tex/server/src/medium/
  medium.module.ts
  medium.controller.ts          # JWT: connect status, start, disconnect
  medium.service.ts             # orchestrate login + publish
  medium-browser.service.ts     # Playwright/Puppeteer
  medium-session.store.ts       # encrypt cookies (reuse RedNote key pattern)
  errors/

Prisma (or user metadata JSON):
  medium_connections / user.metadata.medium
    userId, mediumUsername, publicationId?, cookiesEnc, connectedAt, lastError
```

**Client:**

- Settings Accounts row for Medium (not necessarily Zernio `apiKey` path — custom like RedNote)  
- Connect dialog (browser QR / “open login window” / status poll)  
- Upload channel chip `medium`  

**Ops:**

- Chromium deps in Docker (same class of issues as RedNote)  
- Env: `MEDIUM_COOKIE_ENCRYPTION_KEY`, `MEDIUM_CHROMIUM_PATH`, headless flags  
- Isolate workers so Medium selector breaks do not affect Zernio  

**Risks:** Medium UI / Cloudflare / ToS; treat as best-effort channel with clear “session expired” UX.

---

### 4.3 Option C — Export / import assist (MVP)

```text
User selects Medium in distribute → Mosonic produces Markdown + tags
  → “Copy for Medium” / download .md
  → Optional deep-link to https://medium.com/new-story (user pastes)
```

No session storage. Good for validating content formatting before investing in B.

---

## 5. Content mapping (all options)

| Mosonic field | Medium field |
|---------------|--------------|
| Title / headline | Story title |
| Body (Markdown / HTML from workflow) | Story body (prefer Markdown → Medium editor / HTML) |
| Tags / topics | Up to ~5 Medium tags |
| Canonical / source URL | Canonical link (SEO / cross-post) |
| Cover image | Featured image |
| Schedule | Mosonic scheduler fires publish job at `runAt` (Medium itself has weak native scheduling for automation) |

Use Laconic **scheduler** (`:8010`) only if we need deferred publish of an already-connected Medium job — optional phase 2.

---

## 6. Explicit non-goals

- Do **not** add Medium to `CommsNotifyService` / profile “Get in touch” tiles  
- Do **not** create `communication-service` Medium microservice  
- Do **not** depend on archived Medium OAuth for new tenant onboarding unless Medium reverses policy  

---

## 7. Implementation phases

### Phase 0 — Decision (1–2 days)

- [ ] Ask Zernio: is Medium a supported `platform` for connect + publish?  
- [ ] If yes → Option A only. If no → choose B vs C for v1.  
- [ ] Legal / product: accept browser-automation risk for B?  

### Phase 1 — Channel plumbing (independent of publish tech)

- [ ] Canonical channel id `medium` in distribution utils  
- [ ] Client `ACCOUNT_CHANNELS` (or RedNote-style custom account card) + i18n  
- [ ] Docs stub `docs/setup-medium.md`  
- [ ] Feature flag `MEDIUM_ENABLED=false`  

### Phase 2a — Option A (Zernio)

- [ ] Unlock / connect / sync / disconnect  
- [ ] Publish path through existing upload pipeline  
- [ ] E2E: connect → publish draft → open Medium URL  

### Phase 2b — Option B (browser)

- [ ] Session connect + encrypt store  
- [ ] Publish worker (draft first, then public)  
- [ ] Partition upload like RedNote  
- [ ] Failure UX: session invalid → reconnect  
- [ ] Docker Chromium notes (extend rednote docs pattern)  

### Phase 2c — Option C (assist)

- [ ] Markdown export endpoint / UI action  
- [ ] Copy tags + open Medium new-story  

### Phase 3 — Hardening

- [ ] Publications picker (post to publication vs profile)  
- [ ] Image upload / cover  
- [ ] Metrics + health (publish success rate, session age)  
- [ ] Optional schedule via Laconic scheduler webhook  

---

## 8. Suggested file / doc map (after decision)

| Doc / code | Purpose |
|------------|---------|
| `docs/plan-medium.md` | This plan |
| `docs/setup-medium.md` | Operator setup (env, connect, troubleshoot) — write after Phase 0 |
| `server/docs/medium-chromium.md` | Only if Option B |
| `server/src/medium/**` | Only if Option B |
| `client/.../account-channels.ts` | Channel entry |
| `workflow/distribution-channels.util.ts` | `medium` id |

---

## 9. Open questions (need answers before build)

1. **Vendor:** Does Zernio support Medium today?  
2. **v1 scope:** Draft-only vs public publish?  
3. **Account type:** Personal profile only, or publications too?  
4. **Content format:** Markdown from workflow sufficient, or HTML with embeds?  
5. **Risk appetite:** OK with headless browser (RedNote-class) if API is unavailable?  
6. **Credits / unlock:** Same Zernio unlock economy, or free channel, or separate Medium credit?  

---

## 10. Success criteria

- User can mark Medium connected in Settings  
- From an upload/distribute flow, content reaches Medium as **draft** (minimum) with a returned URL  
- Failures are visible (session expired / publish error) without breaking other channels  
- Docs exist for setup and known limitations (API closed / automation fragility)  

---

## 11. Next step

**Product decision on Phase 0** (Zernio vs browser vs export-only).  
After that, implement Phase 1 + the matching Phase 2 path; do not start Go messaging service work.
