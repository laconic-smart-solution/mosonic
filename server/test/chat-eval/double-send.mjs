#!/usr/bin/env node
/** Double-send check: the same message twice at once in one session. Env: CHAT_EVAL_USER / CHAT_EVAL_PASSWORD (env only). */
const BASE = process.env.CHAT_EVAL_BASE_URL ?? 'http://localhost:3000';
let cookie = '';
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  return { status: res.status, text };
}
const run = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
await api('POST', '/auth/login', { username: process.env.CHAT_EVAL_USER, password: process.env.CHAT_EVAL_PASSWORD });
const s = JSON.parse((await api('POST', '/chat/sessions', { title: 'EVAL double-send ' + run })).text);
const send = (m) => api('POST', '/chat/sessions/' + s.sessionId + '/messages', { content: m });
await send('My brand is EVAL-Dub ' + run + ', a bakery in Chiang Mai. TikTok only.');
await new Promise((r) => setTimeout(r, 20000));
await send('set up the default workflow');
const msg = 'make a post about our new croissant';
const [a, b] = await Promise.all([send(msg), send(msg)]);
const starts = [a, b].map((r) => (r.text.match(/"action\\?":\\?"pipeline_started/g) ?? []).length);
console.log('first:', a.status, 'second:', b.status, 'pipeline starts:', starts.join('+'));
console.log('second body:', b.text.slice(0, 200));
const hist = JSON.parse((await api('GET', '/chat/sessions/' + s.sessionId + '/messages?limit=20')).text);
console.log('session', s.sessionId, 'messages stored:', JSON.stringify(hist).match(/croissant/g)?.length ?? 0, 'mentions');
