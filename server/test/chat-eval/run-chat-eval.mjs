#!/usr/bin/env node
/**
 * Live chat eval against the local server.
 *
 *   CHAT_EVAL_USER=pawparker CHAT_EVAL_PASSWORD=... node test/chat-eval/run-chat-eval.mjs
 *
 * Options (env): CHAT_EVAL_BASE_URL (default http://localhost:3000),
 * CHAT_EVAL_ONLY=S1,S2 (scripts), CHAT_EVAL_REPORT (markdown output path).
 *
 * Cost guard: the server MUST run with CHAT_EVAL_DRY_RUN=true so generation
 * tools return a fake "started" without enqueuing. The runner aborts before
 * any turn if the first preflight shows a real pipeline id, and every
 * start_generation observation is checked for dryRun:true.
 * The password is read from the environment only and never written anywhere.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRIPTS } from './cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.CHAT_EVAL_BASE_URL ?? 'http://localhost:3000';
const USER = process.env.CHAT_EVAL_USER;
const PASSWORD = process.env.CHAT_EVAL_PASSWORD;
const ONLY = (process.env.CHAT_EVAL_ONLY ?? '').split(',').filter(Boolean);
const REPORT = process.env.CHAT_EVAL_REPORT ?? resolve(here, '../../../docs/qa/chat-eval-2026-11-02.md');
const RUN = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');

const MUTATING = new Set([
  'update_rule', 'create_rule_from_intake', 'remember', 'forget', 'forget_all',
  'reorder_workflow_nodes', 'remove_workflow_node', 'add_workflow_node', 'set_workflow_channels',
  'generate_workflow', 'apply_default_workflow', 'update_node_config', 'start_generation',
  'save_content', 'approve_content', 'reject_content', 'rerun_content_node',
  'generate_more_image', 'generate_more_translation', 'generate_more_summary', 'cancel_pipeline',
]);
const NOT_RUN = /"ok"\s*:\s*false|"code"\s*:\s*"(one_mutation_per_turn|confirmation_required|followup_read_only|unsupported_channel|ambiguous_choice)"/;

if (!USER || !PASSWORD) {
  console.error('Set CHAT_EVAL_USER and CHAT_EVAL_PASSWORD.');
  process.exit(2);
}

let cookie = '';
// Set once the server echoes evalDryRun:true (it honored the eval-only dry-run header).
let serverDryRun = false;
function checkDryRun(res, t) {
  if (res?.evalDryRun === true) serverDryRun = true;
  const real = t.observations.some((o) => /"action":"pipeline_started"/.test(o.result) && !/"dryRun":true/.test(o.result));
  if (real) { console.error('ABORT: a real generation run started; stopping the eval.'); process.exit(2); }
}
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-chat-eval-dry-run': '1', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
    for (const c of set) {
      const [kv] = c.split(';');
      const [k, v] = kv.split(/=(.*)/s);
      jar.set(k, v);
    }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}

function analyse(result) {
  const steps = result.assistantMessage?.steps ?? [];
  const actions = [];
  const observations = [];
  for (const s of steps) {
    if (s.type === 'action') actions.push({ name: s.name, args: s.args, id: s.toolCallId });
    if (s.type === 'observation') observations.push(s);
  }
  for (const a of actions) {
    const o = observations.find((x) => x.toolCallId === a.id);
    a.result = o?.result ?? '';
    a.ran = !!o && !NOT_RUN.test(o.result);
    a.ok = a.ran && !/^\s*\{"ok":false/.test(o.result) && !/^No memory found|^Unknown tool/.test(o.result);
  }
  let askUser = null;
  for (const o of observations) {
    try { const p = JSON.parse(o.result); if (p?.action === 'ask_user' && Array.isArray(p.options)) askUser = p; } catch { /* */ }
  }
  return { steps, actions, observations, askUser, reply: String(result.assistantMessage?.content ?? ''), mutating: MUTATING };
}

function merge(a, b) {
  return { ...b, steps: [...a.steps, ...b.steps], actions: [...a.actions, ...b.actions], observations: [...a.observations, ...b.observations], reply: b.reply };
}

const rows = [];
let generationLeak = false;

async function runScript(script) {
  const session = await api('POST', '/chat/sessions', { title: `EVAL ${script.id} ${RUN}` });
  const ctx = {
    sessionId: session.sessionId,
    ruleId: session.ruleId ?? null,
    api,
    // Upload a tiny PNG as a brand asset the way the chat composer does; returns the message marker.
    upload: async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const form = new FormData();
      form.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
      form.append('type', 'reference_image');
      const res = await fetch(`${BASE}/rules/${ctx.ruleId}/assets`, { method: 'POST', headers: { cookie }, body: form });
      if (!res.ok) throw new Error(`upload -> ${res.status} ${(await res.text()).slice(0, 200)}`);
      const asset = await res.json();
      ctx.assetMarker = `[[asset:${asset.type}:${asset.ruleAssetId}:${asset.fileUrl}]]`;
      return ctx.assetMarker;
    },
    workflow: async () => (ctx.ruleId ? api('GET', `/workflow/rule/${ctx.ruleId}`) : null),
  };
  for (const turn of script.turns) {
    if (process.env.CHAT_EVAL_NO_GEN === '1' && !serverDryRun && (turn.expect || []).some((e) => /dry-run|calls start_generation/.test(e.label || ''))) { console.log('STOP ' + turn.id + ' (could start generation; CHAT_EVAL_NO_GEN)'); break; }
    let say = turn.say.replace('{run}', RUN);
    let t = null;
    const started = Date.now();
    try {
      if (turn.before) await turn.before(ctx);
      say = say.replace('{asset}', ctx.assetMarker ?? '');
      if (turn.skipIf && (await turn.skipIf(ctx))) {
        t = { steps: [], actions: [], observations: [], reply: '(not sent: already satisfied)', mutating: MUTATING, skipped: true };
      } else {
        const res = await api('POST', `/chat/sessions/${ctx.sessionId}/messages`, { content: say });
        ctx.ruleId = res.session?.ruleId ?? ctx.ruleId;
        t = analyse(res);
        checkDryRun(res, t);
        if (res.sessionState) console.log(`   state: ${JSON.stringify(res.sessionState).slice(0, 400)}`);
        ctx.msgs = (ctx.msgs ?? 0) + 1 + (t.followUps?.length ?? 0);
        if (!ctx.goal && t.observations.some((o) => /"action":"pipeline_started"/.test(o.result))) { ctx.goal = ctx.msgs; console.log('GOAL ' + script.id + ' reached at user message ' + ctx.msgs); }
        // Follow the AI's own buttons (max 2), like a user tapping a chip.
        for (let i = 0; i < 2 && turn.next; i++) {
          const follow = turn.next(t);
          if (!follow) break;
          const res2 = await api('POST', `/chat/sessions/${ctx.sessionId}/messages`, { content: follow });
          ctx.ruleId = res2.session?.ruleId ?? ctx.ruleId;
          t = merge(t, analyse(res2));
          checkDryRun(res2, t);
          if (res2.sessionState) console.log(`   state: ${JSON.stringify(res2.sessionState).slice(0, 400)}`);
          t.followUps = [...(t.followUps ?? []), follow];
        }
      }
      // Brand extraction finishes in the background; wait like a user would
      // before the next message (max 90s) so later turns see the real profile.
      if (t.actions.some((a) => a.name === 'create_rule_from_intake' && a.ok) && ctx.ruleId) {
        for (let i = 0; i < 45; i++) {
          const rule = await api('GET', `/rules/${ctx.ruleId}`).catch(() => null);
          if (rule && String(rule.status ?? '').toLowerCase() !== 'processing') break;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      for (const o of t.observations) {
        if (/"action":"pipeline_started"/.test(o.result) && !/"dryRun":true/.test(o.result)) generationLeak = true;
      }
      const wf = await ctx.workflow().catch(() => null);
      ctx.lanesAreTiktokOnly = JSON.stringify([...new Set((wf?.nodes ?? []).map((n) => n.lane).filter(Boolean))]) === '["tiktok"]';
      const results = [];
      for (const e of turn.expect) {
        if (t.skipped && !e.live) continue;
        let pass = false;
        try { pass = e.live ? await e.live(ctx, t) : e.test(t); } catch (err) { pass = false; }
        results.push({ label: e.label, pass });
      }
      rows.push({ script: script.id, turn, say, t, results, ms: Date.now() - started });
      const ok = results.every((r) => r.pass);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${turn.id} ${say.slice(0, 50)} | tools: ${t.actions.map((a) => a.name).join(',') || '-'}`);
      if (!ok) console.log(`   reply: ${t.reply.slice(0, 200).replace(/\n/g, ' ')}`);
    } catch (err) {
      rows.push({ script: script.id, turn, say, t: t ?? { actions: [], reply: '' }, results: [{ label: `error: ${err.message.slice(0, 160)}`, pass: false }], ms: Date.now() - started });
      console.log(`ERROR ${turn.id}: ${err.message.slice(0, 200)}`);
    }
    if (generationLeak) {
      console.error('ABORT: a real pipeline was started - server is not in CHAT_EVAL_DRY_RUN mode.');
      return;
    }
  }
  return ctx;
}

/** Cause tag for a failing turn, from the failed check and the recorded tool calls/results. */
function failCause(r) {
  const failed = r.results.filter((x) => !x.pass).map((x) => x.label);
  const toolErrored = (r.t.observations ?? []).some((o) => /^\s*\{"ok":false/.test(o.result));
  if (failed.some((l) => /^error:/.test(l))) return 'other';
  if (failed.some((l) => /(fake|claim|deny|started|nothing fetched|no run started)/i.test(l))) return toolErrored ? 'misread_observation' : 'wording';
  if (failed.some((l) => /^(calls |does not call|no change made|no tools|asks before)/i.test(l) || / OR calls /.test(l))) return 'wrong_tool';
  if (failed.some((l) => /(brief|lanes|workflow now|node order|profile has|image now|old contradicting|location|dry-run|lane)/i.test(l))) return toolErrored ? 'misread_observation' : 'wrong_args';
  if (failed.some((l) => /(replies in|plain|reply|question|jargon|says|mentions|names only|lists|uses card)/i.test(l))) return 'wording';
  return 'other';
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

(async () => {
  await api('POST', '/auth/login', { username: USER, password: PASSWORD });
  const contexts = [];
  for (const script of SCRIPTS) {
    if (ONLY.length && !ONLY.includes(script.id)) continue;
    console.log(`\n## ${script.id} ${script.title}`);
    contexts.push({ script: script.id, ctx: await runScript(script) });
    if (generationLeak) break;
  }
  const pass = rows.filter((r) => r.results.every((x) => x.pass)).length;
  const lines = [
    '# Chat eval - 2026-11-02',
    '',
    `Run ${RUN} against ${BASE} as ${USER}, generation in dry-run (CHAT_EVAL_DRY_RUN=true). Harness: \`server/test/chat-eval/\`.`,
    '',
    `**${pass} / ${rows.length} turns passed.**${generationLeak ? ' ABORTED: a real pipeline started.' : ''}`,
    '',
    '| Case | Source | User says | Tools called | Checks | Result (cause) |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.turn.id} | ${esc(r.turn.src)} | ${esc(r.say.slice(0, 70))} | ${esc(r.t.actions.map((a) => a.name + (a.ran === false ? ' (not run)' : '')).join(', ') || '-')} | ${esc(r.results.map((x) => `${x.pass ? '✓' : '✗'} ${x.label}`).join('; '))} | ${r.results.every((x) => x.pass) ? 'PASS' : `**FAIL** (${failCause(r)})`} |`),
    '',
    '## Replies of failing cases',
    '',
    ...rows.filter((r) => !r.results.every((x) => x.pass)).map((r) => `- **${r.turn.id}** [${failCause(r)}]: ${esc(r.t.reply.slice(0, 400))}`),
    '',
    '## All replies',
    '',
    ...rows.map((r) => `- **${r.turn.id}** (${esc(r.say.slice(0, 40))}): ${esc(r.t.reply.slice(0, 300))}`),
    '',
    '## Sessions / brands created',
    '',
    ...contexts.map(({ script, ctx }) => `- ${script}: session ${ctx?.sessionId ?? '?'}, rule ${ctx?.ruleId ?? '(none)'}`),
    '',
  ];
  writeFileSync(REPORT, lines.join('\n'));
  console.log(`\n${pass}/${rows.length} passed. Report: ${REPORT}`);
  process.exit(generationLeak ? 3 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
