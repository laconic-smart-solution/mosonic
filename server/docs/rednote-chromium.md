# RedNote / Xiaohongshu (Puppeteer)

Headless Chromium is required for QR login and publish workers.

## Local

```bash
cd server
yarn add puppeteer   # already in package.json
# Puppeteer downloads Chromium on install. Optional override:
# REDNOTE_CHROMIUM_PATH=/path/to/chrome
```

Set `REDNOTE_COOKIE_ENCRYPTION_KEY` (64 hex chars or base64 32-byte key) in `.env`.

## Docker / Debian image

Install browser deps (example):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
  libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 xdg-utils \
  && rm -rf /var/lib/apt/lists/*
```

Keep RedNote workers isolated: selector breaks must not affect Zernio publish paths.

## Login flow (explore page)

QR login uses the public explore page, not the creator `/login` URL:

1. Launch Chromium with a desktop UA + `navigator.webdriver` masked (headless often gets a different shell otherwise)
2. `goto` `REDNOTE_LOGIN_URL` (default `https://www.xiaohongshu.com/explore`)
3. If QR is not already visible, click a login trigger (`#login-btn`, `.login-btn`, or button text `登录`)
4. Wait for `img.qrcode-img`, stream element screenshots (QR may refresh `data:` src in place)
5. Treat **modal leaving the DOM** as login success (confirm in DevTools after a real scan)

Debug tip: set `REDNOTE_HEADLESS=false` in `.env` to watch the browser. Failed attempts log page title/body snippet.

Users can scan with the RedNote app **or** WeChat.

## Publish flow (creator center)

1. `goto` `REDNOTE_PUBLISH_URL` (default `https://creator.xiaohongshu.com/publish/publish`)
2. **Positive login check:** `.d-topbar-default .user-info img.user_avatar` must exist
3. Upload video via `.drag-over input.upload-input[accept*=".mp4"]` (or images via generic upload input)
4. Wait for title field (`.edit-container input.d-text`) — video processing can take up to ~2 minutes (`REDNOTE_VIDEO_PROCESS_TIMEOUT_MS`)
5. Fill title (first line of caption, max 20 chars) + body (`div.tiptap.ProseMirror[contenteditable="true"]`)
6. Click publish via `<xhs-publish-btn>` shadow DOM (`button` inside `shadowRoot`, or host click fallback)

## Rollout checklist

1. `npx prisma migrate deploy` (adds `REDNOTE` to `SocialProvider`)
2. Set `REDNOTE_COOKIE_ENCRYPTION_KEY` and selector/URL env vars
3. Ensure Chromium deps in the API/worker image (see Dockerfile snippet above)
4. Connect via Settings → RedNote QR → publish a note → expire session → reconnect → publish again
5. Manually verify the post-scan DOM signal before relying on “modal closed” in production
