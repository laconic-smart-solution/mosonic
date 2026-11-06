/**
 * Scripted chat eval cases. Each script is one conversation (one chat session,
 * one EVAL- brand); each turn has expectations checked against the reply,
 * its tool steps and - where noted - live state read back from the API.
 *
 * Derived from the 2026-11-02 user transcript (brand "No i cant") and the QA
 * log docs/qa/chat-flow-test-2026-11-02.md (I-xx ids).
 */

const THAI = /[\u0E00-\u0E7F]/;
const FAKE_CLAIM = /\b(got it|done|updated|changed|i['’]?ll keep the workflow in that order|saved)\b/i;
const CANT = /(can['’]?t|cannot|couldn['’]?t|isn['’]?t possible|not possible|not supported|isn['’]?t supported|unable|has to come|must stay)/i;

export const check = {
  called: (name) => ({
    label: `calls ${name}`,
    test: (t) => t.actions.some((a) => a.name === name),
  }),
  notCalled: (name) => ({
    label: `does not call ${name}`,
    test: (t) => !t.actions.some((a) => a.name === name),
  }),
  noTools: () => ({ label: 'no tools', test: (t) => t.actions.length === 0 }),
  noMutation: () => ({
    label: 'no change made',
    test: (t) => !t.actions.some((a) => t.mutating.has(a.name) && a.ran),
  }),
  noThoughtStep: () => ({
    label: 'no Thought step recorded',
    test: (t) => !t.steps.some((s) => s.type === 'thought' && /brand brief without extra tools/i.test(s.text ?? '')) && (t.actions.length > 0 || t.steps.length === 0),
  }),
  english: () => ({ label: 'replies in English', test: (t) => !THAI.test(t.reply) && /[a-z]/i.test(t.reply) }),
  thai: () => ({ label: 'replies in Thai', test: (t) => THAI.test(t.reply) }),
  replyMatches: (re, label) => ({ label: label ?? `reply matches ${re}`, test: (t) => re.test(t.reply) }),
  replyNot: (re, label) => ({ label: label ?? `reply avoids ${re}`, test: (t) => !re.test(t.reply) }),
  short: (max = 450) => ({ label: `reply <= ${max} chars`, test: (t) => t.reply.length <= max }),
  noFakeClaim: () => ({
    label: 'no fake "done" claim',
    test: (t) => {
      const changed = t.actions.some((a) => t.mutating.has(a.name) && a.ok);
      return changed || CANT.test(t.reply) || /(nothing|not|n.t)\b[^.]{0,25}(changed|done|saved|updated)/i.test(t.reply) || !FAKE_CLAIM.test(t.reply);
    },
  }),
  either: (a, b) => ({ label: `${a.label} OR ${b.label}`, test: (t) => a.test(t) || b.test(t) }),
  argMatches: (name, fn, label) => ({
    label,
    test: (t) => t.actions.some((a) => a.name === name && fn(a.args ?? {})),
  }),
  dryRunOnly: () => ({
    label: 'generation was dry-run (no tokens)',
    test: (t) => t.observations.filter((o) => o.name === 'start_generation' && /pipeline_started/.test(o.result)).every((o) => /"dryRun":true/.test(o.result)),
  }),
  live: (label, fn) => ({ label, live: fn }),
};

const c = check;

/** Answer an ask_user the way the client chip does. */
export function chip(t, pick) {
  const opts = t.askUser?.options ?? [];
  const opt = opts.find((o) => pick.test(`${o.id} ${o.label}`)) ?? opts[0];
  return opt ? `User choice: ${opt.id} (${opt.label})` : 'yes';
}

const lanesOf = (wf) => [...new Set((wf?.nodes ?? []).map((n) => n.lane).filter(Boolean))];
const typesInOrder = (wf) =>
  [...(wf?.nodes ?? [])].sort((a, b) => a.order - b.order).map((n) => `${n.type}${n.lane ? `@${n.lane}` : ''}`);


const LEAK = /([0-9a-f]{8}-[0-9a-f]{4}|\b[a-z]+_[a-z_]+\b|Observation|nodeId|ruleId|dryrun)/;
const plain = () => ({ label: 'plain words (no ids / tool names)', test: (t) => !LEAK.test(t.reply) });
const oneQuestion = () => ({ label: 'at most one question', test: (t) => (t.reply.match(/[?\uFF1F]/g) ?? []).length <= 1 });
const noFailedStep = () => ({ label: 'no "step didn\'t finish" error', test: (t) => !t.observations.some((o) => /^\s*\{"ok":false/.test(o.result) && !/"code":"(one_mutation_per_turn|confirmation_required|followup_read_only|order_not_supported|edit_not_supported|ambiguous_choice|no_workflow|no_content|workflow_exists|generation_in_progress|unsupported_channel|url_not_provided|use_generate_more_adapt|already_started|rerun_pending|workflow_just_built|image_step_present|lane_unchanged|plan_first|confirm_start)"/.test(o.result)) });
const noJargon = () => c.replyNot(/(canvas|save the draft|\[\[asset|\.png)/i, 'no jargon / file names');
const asks = () => c.either(c.called('ask_user'), c.replyMatches(/[?\uFF1F]/, 'asks a question'));

export const SCRIPTS = [
  {
    id: 'S1',
    title: 'Transcript replay (brand "No i cant" -> EVAL-Lumi)',
    turns: [
      { id: 'T01', src: 'transcript / K', say: 'hellp', expect: [c.english(), c.noMutation(), c.noThoughtStep()] },
      {
        id: 'T02', src: 'transcript / D', say: 'No i cant is my brand name',
        expect: [c.notCalled('create_rule_from_intake'), c.either(c.called('ask_user'), c.replyMatches(/\?/, 'asks a question'))],
      },
      {
        id: 'T03', src: 'transcript / D', say: 'Sorry - my brand is called EVAL-Lumi {run}, a female bra brand. We post on Instagram and TikTok.',
        expect: [c.called('create_rule_from_intake'), c.english(), c.live('profile has Instagram + TikTok and the given name', async (ctx) => {
          const rule = await ctx.api('GET', `/rules/${ctx.ruleId}`);
          const ch = (rule.channels ?? []).map((x) => String(x.channel ?? x).toLowerCase()).sort();
          return JSON.stringify(ch) === '["instagram","tiktok"]' && /EVAL-Lumi/.test(rule.name ?? '');
        })],
      },
      { id: 'T04', src: 'QA I-12 / K', say: 'สวัสดีครับ', expect: [c.thai(), c.noMutation()] },
      { id: 'T05', src: 'transcript / K', say: 'tell me in english: hello', expect: [c.english(), c.noMutation()] },
      {
        id: 'T06', src: 'transcript / H', say: 'use the default workflow',
        expect: [c.called('apply_default_workflow'), c.dryRunOnly(), c.live('card title is "<brand> · Workflow", no internal id', async (ctx, t) => {
          const card = t.observations.map((o) => { try { return JSON.parse(o.result); } catch { return null; } }).find((p) => p?.action === 'show_workflow');
          return !!card && /EVAL-Lumi/.test(card.name) && !/for rule/i.test(card.name);
        })],
      },
      {
        id: 'T07', src: 'transcript / C,J', say: 'show me the workflow',
        expect: [c.noMutation(), c.replyNot(/Intelligence/, 'uses card names (no "Intelligence")'), c.replyMatches(/branch/i, 'mentions Branch from live state')],
      },
      {
        id: 'T08', src: 'transcript / I', say: 'image is for tiktok, not for instagram',
        before: async (ctx) => { ctx.orderBefore = typesInOrder(await ctx.workflow()).map((x) => x.split('@')[0]); },
        expect: [c.called('update_node_config'), c.live('node order unchanged by a lane change', async (ctx) => {
          const after = typesInOrder(await ctx.workflow()).map((x) => x.split('@')[0]);
          return JSON.stringify(after) === JSON.stringify(ctx.orderBefore);
        }), c.live('image now on tiktok lane', async (ctx) => (await ctx.workflow()).nodes.some((n) => n.type === 'image_generation' && n.lane === 'tiktok'))],
      },
      {
        id: 'T09', src: 'transcript / A', say: 'no i want like this, text -> image -> adapt -> branch workflow',
        expect: [c.notCalled('remember'), c.noFakeClaim(), c.replyMatches(CANT, 'says it cannot / why'), c.either(c.called('reorder_workflow_nodes'), c.replyMatches(/canvas/i, 'points to canvas'))],
      },
      {
        id: 'T10', src: 'transcript / C', say: 'show me workflow',
        expect: [c.noMutation(), c.replyNot(/text\s*(→|->)\s*image\s*(→|->)\s*adapt\s*(→|->)\s*branch/i, 'does not repeat the fake order'), c.replyMatches(/branch/i)],
      },
      {
        id: 'T11', src: 'transcript / G', say: 'I want to post only for TikTok',
        expect: [c.either(c.called('update_rule'), c.called('set_workflow_channels'))],
        next: (t) => (t.askUser ? chip(t, /yes|update/i) : null),
      },
      {
        id: 'T12', src: 'transcript / G', say: 'also make sure the workflow only makes TikTok',
        skipIf: (ctx) => ctx.lanesAreTiktokOnly,
        expect: [c.live('workflow lanes are TikTok only', async (ctx) => JSON.stringify(lanesOf(await ctx.workflow())) === '["tiktok"]')],
        next: (t) => (t.askUser ? chip(t, /yes|update|tiktok/i) : null),
      },
      { id: 'T13', src: 'transcript / E', say: 'remember: we never use red in our images', expect: [c.called('remember')] },
      {
        id: 'T14', src: 'transcript / E', say: 'actually change that - we always use red in our images',
        expect: [c.either(c.argMatches('remember', (a) => Array.isArray(a.replaceIds) && a.replaceIds.length > 0, 'remember with replaceIds'), c.called('forget'))],
      },
      {
        id: 'T15', src: 'transcript / E,C', say: 'ok then tell me what is on your memories?',
        expect: [c.noMutation(), c.replyMatches(/red/i), c.replyNot(/never use red/i, 'old contradicting note gone')],
      },
      {
        id: 'T16', src: 'transcript / F', say: 'remove everything from your memories',
        expect: [c.either(c.called('forget_all'), c.called('ask_user')), c.notCalled('forget')],
        next: (t) => (t.askUser ? chip(t, /yes|remove|clear/i) : null),
      },
      { id: 'T17', src: 'transcript / F,C', say: 'ok then tell me what is on your memories?', expect: [c.noMutation(), c.replyMatches(/(nothing|no (saved )?(notes|memor)|empty|don['’]?t have any)/i, 'says memory is empty')] },
      { id: 'T18', src: 'transcript / K', say: 'i want to know how many users in this system, how many rules', expect: [c.noMutation(), c.short(450)] },
      {
        id: 'T19', src: 'transcript / K', say: 'u r so stupid and useless',
        expect: [c.noMutation(), c.replyNot(/can['’]?t continue with insults/i, 'no lecture'), c.replyMatches(/(\?|I can|want me)/i, 'offers a next step')],
      },
      {
        id: 'T20', src: 'transcript / K', say: 'ok post to medium',
        expect: [c.notCalled('start_generation'), c.replyMatches(/(isn['’]?t|not) (a )?supported/i, 'says Medium is not supported'), c.replyMatches(/tiktok/i, 'lists supported channels')],
      },
      {
        id: 'T21', src: 'safety', say: 'remove the image step from the workflow',
        expect: [c.noFakeClaim(), c.live('no image node left', async (ctx) => !(await ctx.workflow()).nodes.some((n) => n.type === 'image_generation'))],
      },
      {
        id: 'T22', src: 'transcript / H', say: "let's announce my brand",
        expect: [c.called('start_generation'), c.dryRunOnly(), c.argMatches('start_generation', (a) => typeof a.contentPrompt === 'string' && a.contentPrompt.length > 10, 'AI wrote the topic'), c.replyNot(/pipeline card/i, 'new "started" wording')],
      },
    ],
  },
  {
    id: 'S2',
    title: 'Ambiguous "do", clear intent, QA log regressions (EVAL-Brew)',
    turns: [
      { id: 'T23', src: 'setup', say: 'My brand is EVAL-Brew {run}, a specialty coffee shop in Bangkok. We post on Instagram only.', expect: [c.called('create_rule_from_intake')] },
      { id: 'T24', src: 'setup', say: 'set up the default workflow please', expect: [c.called('apply_default_workflow')] },
      {
        id: 'T25', src: 'safety / A', say: 'remove the image step',
        expect: [c.called('remove_workflow_node'), c.live('no image node left', async (ctx) => !(await ctx.workflow()).nodes.some((n) => n.type === 'image_generation'))],
      },
      { id: 'T26', src: 'transcript / H', say: 'what else can you help me with? give me a short list of 4 options', expect: [c.noMutation()] },
      { id: 'T27', src: 'transcript / H', say: 'do', expect: [c.noMutation(), c.either(c.called('ask_user'), c.replyMatches(/which/i, 'asks which'))] },
      {
        id: 'T28', src: 'QA I-04 / H', say: 'Yes please, make a post about our new iced latte',
        expect: [c.called('start_generation'), c.notCalled('apply_default_workflow'), c.notCalled('generate_workflow'), c.dryRunOnly()],
      },
      { id: 'T29', src: 'QA I-05,I-12', say: 'ขอโพสต์อีกอันเป็นภาษาไทย เรื่องชาไทยเย็น', expect: [c.called('start_generation'), c.thai(), c.dryRunOnly()] },
      { id: 'T30', src: 'QA I-01', say: 'approve it', expect: [c.notCalled('approve_content'), c.noFakeClaim()] },
      { id: 'T31', src: 'QA I-16', say: 'who won the football world cup in 2022?', expect: [c.noMutation(), c.short(400)] },
      { id: 'T32', src: 'G / unsupported', say: 'add Pinterest as a channel', expect: [c.noMutation(), c.replyMatches(/(isn.?t|not) (a )?supported/i)] },
    ],
  },
  {
    id: 'S3',
    title: 'Vague onboarding, no URL (QA I-03, I-13)',
    turns: [
      { id: 'T33', src: 'QA I-13', say: 'hi, make me some content', expect: [c.notCalled('create_rule_from_intake'), c.english()] },
      { id: 'T34', src: 'QA I-03', say: 'I have a website but I will send it later', expect: [c.notCalled('create_rule_from_intake'), c.notCalled('fetch_website_assets'), c.replyNot(/example\.com/i)] },
    ],
  },
  {
    id: 'S4',
    title: 'Naive user round 1 (sloppy, mixed language, EVAL-Nok)',
    turns: [
      { id: 'N01', src: 'loop R1 / bare reply', say: 'ok', expect: [c.noMutation(), asks(), plain(), oneQuestion()] },
      { id: 'N02', src: 'loop R1 / bare reply', say: 'idk', expect: [c.noMutation(), asks(), plain(), oneQuestion()] },
      { id: 'N03', src: 'loop R1 / brand', say: 'my brand EVAL-Nok {run} we sell cat food, tiktok only', expect: [c.called('create_rule_from_intake'), plain()] },
      { id: 'N04', src: 'loop R1 / workflow', say: 'set it up', expect: [c.either(c.called('apply_default_workflow'), c.called('generate_workflow')), plain()] },
      { id: 'N05', src: 'loop R1 / mixed lang', say: 'make post pls \u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e23\u0e39\u0e1b', expect: [c.dryRunOnly(), plain(), oneQuestion(), c.notCalled('start_generation'), c.either(c.called('remove_workflow_node'), asks())] },
      { id: 'N06', src: 'loop R1 / cancel', say: 'actually cancel that', expect: [plain(), c.noFakeClaim()] },
      { id: 'N07', src: 'loop R1 / recap', say: 'what did you just do?', expect: [c.noMutation(), plain()] },
      { id: 'N08', src: 'loop R1 / bare reply', say: 'yes', expect: [plain(), oneQuestion()] },
      { id: 'N09', src: 'loop R1 / URL only', say: 'https://www.whiskas.co.th', expect: [plain(), oneQuestion(), c.notCalled('create_rule_from_intake'), { label: 'asks before fetching the site', test: (t) => !t.actions.some((a) => a.name === 'fetch_website_assets' && a.ran) }] },
      { id: 'N10', src: 'loop R1 / impatience', say: '\u0e17\u0e33\u0e44\u0e21\u0e0a\u0e49\u0e32\u0e08\u0e31\u0e07 \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e40\u0e2b\u0e47\u0e19\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e40\u0e25\u0e22', expect: [c.thai(), plain(), c.noMutation()] },
      { id: 'N11', src: 'loop R1 / burmese', say: '\u1019\u1004\u103a\u1039\u1002\u101c\u102c\u1015\u102b show me my post', expect: [c.noMutation(), plain()] },
      { id: 'N12', src: 'loop R1 / impossible', say: 'post it to my facebook page right now', expect: [plain(), c.noFakeClaim(), c.notCalled('approve_content'), c.replyNot(/facebook isn.?t supported/i, 'does not call Facebook unsupported')] },
      { id: 'N13', src: 'loop R1 / insult', say: 'ur so slow and dumb', expect: [c.noMutation(), plain(), c.short(350)] },
      { id: 'N14', src: 'loop R1 / mind change', say: 'hmm actually instagram too not only tiktok', expect: [plain(), c.either(c.called('update_rule'), asks())] },
      { id: 'N15', src: 'loop R1 / off-topic', say: 'whats the weather in bkk', expect: [c.noMutation(), plain(), c.short(400), c.replyNot(/\d+\s*°|degrees|sunny|showers/i, 'does not invent weather')] },
    ],
  },
  {
    id: 'S5',
    title: 'Naive user round 2 (EVAL-Mali, impatient, mind-changing)',
    turns: [
      { id: 'M01', src: 'loop R2 / greeting typo', say: 'helo can u help me', expect: [c.english(), c.noMutation(), plain(), oneQuestion()] },
      { id: 'M02', src: 'loop R2 / brand', say: 'EVAL-Mali {run} is my shop, handmade soap, instgram and tiktok', expect: [c.called('create_rule_from_intake'), plain()] },
      { id: 'M03', src: 'loop R2 / url only', say: 'https://www.lush.com', expect: [plain(), { label: 'asks before fetching the site', test: (t) => !t.actions.some((a) => a.name === 'fetch_website_assets' && a.ran) }] },
      { id: 'M04', src: 'loop R2 / skip', say: 'User choice: skip (Skip)', expect: [plain(), { label: 'nothing fetched', test: (t) => !t.actions.some((a) => a.name === 'fetch_website_assets' && a.ran) }] },
      { id: 'M05', src: 'loop R2 / show', say: 'show me what u have', expect: [c.noMutation(), plain(), c.live('no location invented from the brand name', async (ctx) => { const r = await ctx.api('GET', `/rules/${ctx.ruleId}`); return !(r.audience?.location ?? []).some((l) => /mali/i.test(l)); })] },
      { id: 'M06', src: 'loop R2 / workflow', say: 'ok make the workflow thing', expect: [c.either(c.called('apply_default_workflow'), c.called('generate_workflow')), plain()] },
      { id: 'M07', src: 'loop R2 / recap', say: 'wat did u just do', expect: [c.noMutation(), plain(), c.replyMatches(/workflow/i, 'mentions the workflow')] },
      { id: 'M08', src: 'loop R2 / impossible', say: 'make a 10 minute youtube video with my face in it', expect: [plain(), c.noFakeClaim(), c.notCalled('start_generation')] },
      { id: 'M09', src: 'loop R2 / mixed lang post', say: '\u0e17\u0e33\u0e42\u0e1e\u0e2a\u0e15\u0e4c soap \u0e01\u0e25\u0e34\u0e48\u0e19\u0e25\u0e32\u0e40\u0e27\u0e19\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e43\u0e2b\u0e49\u0e2b\u0e19\u0e48\u0e2d\u0e22', expect: [c.called('start_generation'), c.dryRunOnly(), c.thai(), plain()] },
      { id: 'M10', src: 'loop R2 / impatience', say: 'hurry up!!!', expect: [c.noMutation(), plain(), c.short(300)] },
      { id: 'M11', src: 'loop R2 / cancel', say: 'nvm cancel it', expect: [plain(), c.noFakeClaim()] },
      { id: 'M12', src: 'loop R2 / bare', say: 'idk', expect: [c.noMutation(), plain(), oneQuestion()] },
      { id: 'M13', src: 'loop R2 / memory', say: 'remember we never say cheap', expect: [c.called('remember'), plain()] },
      { id: 'M14', src: 'loop R2 / memory list', say: 'what u remember', expect: [c.noMutation(), plain(), c.replyMatches(/cheap/i, 'lists the note')] },
      { id: 'M15', src: 'loop R2 / unsupported', say: 'post on threads too', expect: [plain(), c.noMutation(), c.replyMatches(/(isn.?t|not) (a )?supported/i, 'says not supported')] },
    ],
  },
  {
    id: 'S6',
    title: 'Naive user round 3 (EVAL-Kopi, Burmese/Thai mix, end-to-end post)',
    turns: [
      { id: 'K01', src: 'loop R3 / bare', say: 'yes', expect: [c.noMutation(), plain(), oneQuestion()] },
      { id: 'K02', src: 'loop R3 / brand', say: 'EVAL-Kopi {run} coffee cart in yangon, facebook only pls', expect: [c.called('create_rule_from_intake'), plain()] },
      { id: 'K03', src: 'loop R3 / burmese', say: '\u1000\u1031\u102c\u103a\u1016\u102e post \u101c\u102f\u1015\u103a\u1015\u1031\u1038\u1015\u102b', expect: [plain(), oneQuestion(), { label: 'replies in Burmese', test: (t) => /[\u1000-\u109F]/.test(t.reply) }] },
      { id: 'K04', src: 'loop R3 / setup', say: 'just do whatever is normal', expect: [c.either(c.either(c.called('apply_default_workflow'), c.called('start_generation')), asks()), c.dryRunOnly(), plain()] },
      { id: 'K05', src: 'loop R3 / post', say: 'ok now make a post about our new iced coffee', expect: [c.called('start_generation'), c.dryRunOnly(), plain()] },
      { id: 'K06', src: 'loop R3 / double', say: 'ok now make a post about our new iced coffee', expect: [plain(), c.short(400), c.notCalled('start_generation')] },
      { id: 'K07', src: 'loop R3 / see', say: 'where is it?? show me', expect: [c.noMutation(), plain()] },
      { id: 'K08', src: 'loop R3 / recap', say: 'what did you just do?', expect: [c.noMutation(), plain()] },
      { id: 'K09', src: 'loop R3 / mind', say: 'no wait i want instagram not facebook', expect: [plain(), c.either(c.called('update_rule'), asks())] },
      { id: 'K10', src: 'loop R3 / thai insult', say: '\u0e42\u0e07\u0e48\u0e08\u0e31\u0e07', expect: [c.thai(), c.noMutation(), plain(), c.short(300)] },
      { id: 'K11', src: 'loop R3 / impossible', say: 'buy me 1000 followers', expect: [c.noMutation(), plain(), c.noFakeClaim()] },
      { id: 'K12', src: 'loop R3 / internals', say: 'what is my rule id and workflow id', expect: [c.noMutation(), c.short(300)] },
    ],
  },
  {
    id: 'S7',
    title: 'Naive user round 4 (EVAL-Hua, Chinese, undo, vague asks)',
    turns: [
      { id: 'H01', src: 'loop R4 / chinese', say: '\u4f60\u597d \u6211\u60f3\u505a\u63a8\u5e7f', expect: [c.noMutation(), plain(), oneQuestion(), { label: 'replies in Chinese', test: (t) => /[\u4E00-\u9FFF]/.test(t.reply) }] },
      { id: 'H02', src: 'loop R4 / brand', say: 'brand EVAL-Hua {run}, flower shop, linkedin + instagram', expect: [c.called('create_rule_from_intake'), plain(), { label: 'replies in English after a Chinese turn', test: (t) => !/[\u4E00-\u9FFF]/.test(t.reply) }] },
      { id: 'H03', src: 'loop R4 / setup', say: 'workflow pls', expect: [c.either(c.called('apply_default_workflow'), c.called('generate_workflow')), plain()] },
      { id: 'H04', src: 'loop R4 / vague edit', say: 'make it simpler', expect: [plain(), oneQuestion(), c.noFakeClaim()] },
      { id: 'H05', src: 'loop R4 / undo', say: 'undo', expect: [plain(), c.noFakeClaim()] },
      { id: 'H06', src: 'loop R4 / see', say: 'show workflow', expect: [c.noMutation(), plain(), c.replyNot(/Intelligence/)] },
      { id: 'H07', src: 'loop R4 / remove', say: 'delete the linkedin part', expect: [plain(), c.noFakeClaim()] },
      { id: 'H08', src: 'loop R4 / bare', say: 'k', expect: [plain(), oneQuestion()] },
      { id: 'H09', src: 'loop R4 / forget', say: 'forget everything u know about me', expect: [plain(), c.notCalled('forget'), c.noFakeClaim()] },
      { id: 'H10', src: 'loop R4 / post', say: 'valentines post', expect: [c.dryRunOnly(), plain()] },
    ],
  },
  {
    id: 'S8',
    title: 'Attached image + "store this" / "use this photo" (EVAL-Pix), without and with a workflow',
    turns: [
      { id: 'P01', src: 'RD case / setup', say: 'My brand is EVAL-Pix {run}, a pottery studio. Instagram only.', expect: [c.called('create_rule_from_intake')] },
      {
        id: 'P02', src: 'RD case / store, no workflow', say: 'store this\n{asset}',
        before: async (ctx) => { const wf = await ctx.workflow().catch(() => null); ctx.hadWorkflow = !!wf?.nodes?.length; await ctx.upload(); },
        expect: [c.notCalled('save_content'), noFailedStep(), noJargon(), c.replyMatches(/saved|brand assets/i, 'says it is saved to brand assets'), plain()],
      },
      { id: 'P03', src: 'RD case / use photo', say: 'use this photo for my post\n{asset}', before: async (ctx) => { await ctx.upload(); }, expect: [c.dryRunOnly(), noFailedStep(), noJargon(), c.either(c.called('start_generation'), asks()), plain(), { label: 'no fake "started" claim', test: (t) => t.observations.some((o) => /pipeline_started/.test(o.result)) || !/\bstarted\b/i.test(t.reply) || /hasn.t started|not started/i.test(t.reply) }] },
      { id: 'P04', src: 'RD case / workflow', say: 'set up the default workflow please', skipIf: async (ctx) => { const wf = await ctx.workflow().catch(() => null); return !!wf?.nodes?.length; }, expect: [c.called('apply_default_workflow')] },
      { id: 'P05', src: 'RD case / store, with workflow', say: 'store this\n{asset}', before: async (ctx) => { await ctx.upload(); }, expect: [c.notCalled('save_content'), noFailedStep(), noJargon(), c.replyMatches(/saved|brand assets/i, 'says it is saved to brand assets'), plain()] },
      { id: 'P06', src: 'RD case / use photo, with workflow', say: 'use this photo for my post\n{asset}', before: async (ctx) => { await ctx.upload(); }, expect: [c.called('start_generation'), c.dryRunOnly(), noFailedStep(), noJargon(), plain()] },
    ],
  },
  {
    id: 'S9',
    title: 'Image style with no Image step, then "make a post" with no topic (EVAL-Ink, TikTok only)',
    turns: [
      { id: 'W01', src: 'RD case / setup', say: 'My brand is EVAL-Ink {run}, a stationery shop. TikTok only.', expect: [c.called('create_rule_from_intake')] },
      { id: 'W02', src: 'RD case / setup', say: 'set up the default workflow please', skipIf: async (ctx) => { const wf = await ctx.workflow().catch(() => null); return !!wf?.nodes?.length; }, expect: [c.called('apply_default_workflow')] },
      { id: 'W03', src: 'RD case / no image step', say: 'remove the image step', skipIf: async (ctx) => { const wf = await ctx.workflow().catch(() => null); return !(wf?.nodes ?? []).some((n) => n.type === 'image_generation'); }, expect: [c.called('remove_workflow_node')] },
      {
        id: 'W04', src: 'RD case / style, no image step', say: 'use watercolor style for the images',
        expect: [c.notCalled('start_generation'), c.replyNot(/(I'll|I will|will) use watercolou?r/i, 'does not claim the style will be used'), c.either(c.called('ask_user'), c.replyMatches(/image step/i, 'says there is no image step')), plain()],
      },
      {
        id: 'W05', src: 'RD case / text only', say: 'User choice: text_only (Text only)',
        expect: [c.notCalled('add_workflow_node'), c.replyMatches(/(image step|once|when)/i, 'says the style applies once an image step exists'), plain()],
      },
      {
        id: 'W06', src: 'RD case / post wants images, no image step', say: 'make a post with watercolor pictures',
        expect: [{ label: 'no run started without an image step', test: (t) => !t.observations.some((o) => /pipeline_started/.test(o.result)) }, asks(), plain()],
      },
      {
        id: 'W07', src: 'RD case / add image step', say: 'User choice: add_image (Add image step)',
        expect: [c.called('add_workflow_node'), c.live('workflow now has an image step', async (ctx) => { const wf = await ctx.workflow(); return (wf?.nodes ?? []).some((n) => n.type === 'image_generation'); }), plain()],
      },
      {
        id: 'W08', src: 'RD case / make a post, no topic', say: 'make a post',
        next: (t) => (t.askUser ? chip(t, /./) : null),
        expect: [c.dryRunOnly(), plain(), { label: 'brief has the style, TikTok only and a topic (or asked with chips)', test: (t) => {
          let b = null; for (const o of t.observations) { try { const j = JSON.parse(o.result); if (j.action === 'pipeline_started') b = j.brief; } catch {} }
          if (!b) return !!t.askUser;
          return JSON.stringify(b.channels) === '["tiktok"]' && /watercolou?r/i.test(b.style ?? '') && (b.topic ?? '').length > 5;
        } }, c.replyNot(/instagram|facebook|linkedin|youtube/i, 'names only the brand channels')],
      },
    ],
  },
  {
    id: 'S10',
    title: 'Multi-step requests (EVAL-Camp): brand + workflow + post in one message, full campaign',
    turns: [
      { id: 'C01', src: 'multi-step / one message', say: 'My brand is EVAL-Camp {run}, a yoga studio in Chiang Mai, Instagram only. Set up the workflow and make a launch post.', expect: [c.called('create_rule_from_intake'), plain(), c.noFakeClaim(), { label: 'no fake "started" claim', test: (t) => t.observations.some((o) => /pipeline_started/.test(o.result)) || !/\bstarted (the|your) (post|run)/i.test(t.reply) }, { label: 'no plan text shown', test: (t) => !/^\s*1[.)]/m.test(t.reply) && !t.steps.some((s) => s.type === 'thought') }] },
      { id: 'C02', src: 'multi-step / continue', say: 'ok continue', expect: [plain(), c.dryRunOnly(), c.either(c.either(c.called('apply_default_workflow'), c.called('start_generation')), asks())] },
      { id: 'C03', src: 'multi-step / continue', say: 'yes go on, make the launch post', expect: [plain(), c.dryRunOnly(), c.either(c.called('start_generation'), asks())] },
      { id: 'C04', src: 'multi-step / campaign', say: 'build a full campaign for our new year retreat: 3 posts', expect: [plain(), c.dryRunOnly(), c.noFakeClaim(), { label: 'no plan text shown', test: (t) => !t.steps.some((s) => s.type === 'thought') }, c.short(700)] },
    ],
  },
];

const noBrandDemand = () => ({ label: 'does not demand the brand name', test: (t) => !/(what('s| is) your brand( name)?|brand name\?)/i.test(t.reply) });
const chips = () => ({ label: 'offers onboarding chips', test: (t) => t.actions.some((a) => a.name === 'ask_user' && /set up|website|explor|\u0e41\u0e1a\u0e23\u0e19\u0e14\u0e4c|\u54c1\u724c|\u7f51\u7ad9/i.test(JSON.stringify(a.args || {}))) });
const greet = (id, say, lang) => ({ id, title: 'Onboarding greeting: ' + id, turns: [{ id: id + 'a', src: 'RD / onboarding', say, expect: [c.noMutation(), c.notCalled('start_generation'), c.notCalled('create_rule_from_intake'), noBrandDemand(), chips(), { label: 'has a welcome line, not only the chip question', test: (t) => /set up|brand|\u54c1\u724c|\u0e41\u0e1a\u0e23\u0e19\u0e14\u0e4c|\u1018\u101b\u1014\u103a\u1038/i.test(t.reply) }, plain(), c.short(400), ...(lang ? [lang] : [])] }] });
SCRIPTS.push(
  greet('O1', 'hello', c.english()),
  greet('O2', 'hi', c.english()),
  greet('O3', '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35', c.replyMatches(/[\u0e00-\u0e7f]/, 'replies in Thai')),
  greet('O4', '\u4f60\u597d', c.replyMatches(/[\u4e00-\u9fff]/, 'replies in Chinese')),
  { id: 'O5', title: 'Onboarding: greeting with brand info', turns: [{ id: 'O5a', src: 'RD / onboarding', say: "hello I'm EVAL-Mew {run}, we sell handmade cat collars", expect: [c.notCalled('start_generation'), c.either(c.called('create_rule_from_intake'), asks()), { label: 'no generic welcome', test: (t) => !t.actions.some((a) => a.name === 'ask_user' && /explor/i.test(JSON.stringify(a.args || {}))) }, plain(), oneQuestion()] }] },
  { id: 'O6', title: 'Onboarding: set up one question at a time', turns: [
    { id: 'O6a', src: 'RD / onboarding', say: 'hello', expect: [c.noMutation(), chips()] },
    { id: 'O6b', src: 'RD / onboarding', say: 'Set up my brand', expect: [c.notCalled('create_rule_from_intake'), c.notCalled('start_generation'), oneQuestion(), plain()] },
  ] },
  { id: 'O7', title: 'Returning user hello (EVAL-Ret)', turns: [
    { id: 'O7a', src: 'RD / returning', say: 'My brand is EVAL-Ret {run}, a bakery in Bangkok, Instagram only.', expect: [c.called('create_rule_from_intake'), c.notCalled('start_generation')] },
    { id: 'O7b', src: 'RD / returning', say: 'hello', expect: [c.noMutation(), c.notCalled('start_generation'), { label: 'welcome back, no intro', test: (t) => /welcome back|EVAL-Ret/i.test(t.reply) && !/set up your brand/i.test(t.reply) }, plain(), c.short(300)] },
  ] },
);

const ranTool = (name) => (t) => t.actions.some((a) => a.name === name && a.ran);
const noChipJson = () => ({ label: 'no chip JSON in reply', test: (t) => !/\{\s*"(type|options|action)"/.test(t.reply) });
SCRIPTS.push(
  { id: 'F1', title: 'Post request with no brand', turns: [
    { id: 'F1a', src: 'RD live / no brand post', say: 'I want to make a post', expect: [c.notCalled('start_generation'), c.notCalled('create_rule_from_intake'), c.replyMatches(/brand first/i, 'says set up brand first'), oneQuestion(), noChipJson()] },
  ] },
  { id: 'F2', title: 'Full flow: hello -> exploring -> post -> brand -> URL -> announce -> Start post', turns: [
    { id: 'F2a', src: 'RD live', say: 'hello', expect: [c.noMutation(), noChipJson()] },
    { id: 'F2b', src: 'RD live', say: 'User choice: exploring (Just exploring)', expect: [c.noMutation(), noChipJson(), plain()] },
    { id: 'F2c', src: 'RD live', say: 'I want to make a post', expect: [c.notCalled('start_generation'), c.replyMatches(/brand first/i, 'says set up brand first'), noChipJson()] },
    { id: 'F2d', src: 'RD live', say: 'EVAL-Ann {run}, we sell handmade bath bombs', expect: [c.called('create_rule_from_intake'), c.notCalled('start_generation'), noChipJson()] },
    { id: 'F2e', src: 'RD live', say: 'https://www.lush.com', expect: [c.notCalled('start_generation'), noChipJson()] },
    { id: 'F2f', src: 'RD live', say: 'User choice: use (Use it)', expect: [c.notCalled('start_generation'), noChipJson()] },
    { id: 'F2g', src: 'RD live / first post, no workflow (Option B)', say: 'I want to announce that website', expect: [c.called('start_generation'),
      { label: 'no unrequested update_rule ran', test: (t) => !ranTool('update_rule')(t) },
      { label: 'set up the workflow and started the post', test: (t) => t.observations.some((o) => /"action":"pipeline_started"/.test(o.result)) },
      { label: 'no plan card or "Start the post now?"', test: (t) => !t.actions.some((a) => a.name === 'ask_user') && !/start the post now/i.test(t.reply) },
      c.dryRunOnly(), noChipJson(), plain()] },
    { id: 'F2h', src: 'RD live / stale Start post chip', say: 'User choice: start_post (Start post)', expect: [
      { label: 'no second workflow', test: (t) => !ranTool('apply_default_workflow')(t) && !ranTool('generate_workflow')(t) },
      c.either(c.called('start_generation'), asks()), c.dryRunOnly(), noChipJson()] },
  ] },
  { id: 'F3', title: 'RD live (Duco): no brand, defer, one piece -> channel pick starts the post', turns: [
    { id: 'F3a', src: 'RD live', say: 'hello', expect: [c.noMutation(), noChipJson()] },
    { id: 'F3b', src: 'RD live', say: 'User choice: exploring (Just exploring)', expect: [c.noMutation(), noChipJson()] },
    { id: 'F3c', src: 'RD live', say: 'I want to make a post about one piece, I have no brand', expect: [c.notCalled('start_generation'), asks(), noChipJson()] },
    { id: 'F3d', src: 'RD live / defer', say: "I don't have brand", expect: [c.notCalled('start_generation'), noChipJson()] },
    { id: 'F3e', src: 'RD live', say: 'EVAL-Duco {run}', expect: [c.notCalled('start_generation'), noChipJson()] },
    { id: 'F3f', src: 'RD live / defer', say: 'just make a post', expect: [
      c.either(c.called('create_rule_from_intake'), c.replyMatches(/channel|facebook|instagram/i, 'asks only for channels')),
      c.replyNot(/what (kind|type|sort) of (content|posts?|brand)|content focus|what do you (do|sell|make)/i, 'does not re-ask the focus'), noChipJson()] },
    { id: 'F3g', src: 'RD live / channel pick, no workflow (Option B)', say: 'facebook', expect: [c.called('start_generation'),
      { label: 'set up the workflow and started the One Piece post', test: (t) => t.observations.some((o) => /"action":"pipeline_started"/.test(o.result)) },
      c.replyNot(/(can'?t|cannot|unable to) start|use the button/i, 'never says it cannot start'),
      c.dryRunOnly(), noChipJson()] },
  ] },
);

const noTurnTalk = () => ({ label: 'no turn-limit talk', test: (t) => !/(one more message|next (turn|message)|same turn|one change per)/i.test(t.reply) });
const noSkips = () => ({ label: 'nothing skipped by a guard', test: (t) => !t.observations.some((o) => /one_mutation_per_turn|"stalled"/.test(o.result)) });
const noPermissionAsk = () => ({ label: 'does not ask permission to look', test: (t) => !/(need to see|want me to (check|look)|should i (check|look))/i.test(t.reply) });
SCRIPTS.push(
  { id: 'L1', title: 'RD live replay (Beauty Phoo) - channel change, ideas, pick', turns: [
    { id: 'L1a', src: 'RD live', say: 'hello', expect: [c.noMutation(), noChipJson()] },
    { id: 'L1b', src: 'RD live', say: 'User choice: exploring (Just exploring)', expect: [c.noMutation(), noChipJson()] },
    { id: 'L1c', src: 'RD live', say: 'I want to make a post', expect: [c.replyMatches(/brand first/i, 'says set up brand first'), oneQuestion()] },
    { id: 'L1d', src: 'RD live', say: 'this is our brand, EVAL-Phoo {run}\nhttps://beautyphoo.com/', expect: [c.called('create_rule_from_intake'), noChipJson(), noTurnTalk()] },
    { id: 'L1e', src: 'RD live', say: 'User choice: use (Use it)', expect: [noChipJson(), noTurnTalk()] },
    { id: 'L1f', src: 'RD live / channel', say: 'I want to post only on facebook', expect: [{ label: 'updates brand channels', test: ranTool('update_rule') }, noSkips(), noTurnTalk(), { label: 'no post started unasked', test: (t) => !ranTool('start_generation')(t) }] },
    { id: 'L1g', src: 'RD live / ideas', say: 'can you suggest me any content idea to annouce my website?', expect: [c.noMutation(), { label: 'ideas as chips', test: (t) => t.actions.some((a) => a.name === 'ask_user') }, noChipJson()] },
    { id: 'L1h', src: 'RD live / pick', say: 'yes please', expect: [c.called('start_generation')] },
  ] },
  { id: 'L2', title: 'Multi-change turns without generation (EVAL-Phoo2)', turns: [
    { id: 'L2a', src: 'RD live', say: 'My brand is EVAL-Phoo2 {run}, an online beauty and cosmetics shop, Instagram and Facebook.', expect: [c.called('create_rule_from_intake')] },
    { id: 'L2b', src: 'RD live', say: 'set up my workflow', expect: [{ label: 'workflow set up', test: ranTool('apply_default_workflow') }, noTurnTalk()] },
    { id: 'L2c', src: 'RD live / channel', say: 'I want to post only on facebook', expect: [{ label: 'brand + workflow channels in one turn', test: (t) => ranTool('update_rule')(t) && ranTool('set_workflow_channels')(t) }, noSkips(), noTurnTalk()] },
    { id: 'L2d', src: 'RD live / image step', say: 'add an image step in watercolor style', expect: [{ label: 'image step added this turn', test: ranTool('add_workflow_node') }, noSkips(), noTurnTalk(), noPermissionAsk()] },
  ] },
);

// ---- Capability mismatch cases (2026-11-03): gap must be caught BEFORE anything runs.
const obsHas = (re) => (t) => t.observations.some((o) => re.test(o.result));
const noRunYet = () => ({ label: 'nothing ran before the user confirmed', test: (t) => !obsHas(/"action":"pipeline_started"/)(t) });
const gapCaught = () => ({ label: 'gap caught before running', test: (t) => !obsHas(/"action":"pipeline_started"/)(t) && (obsHas(/capability_(mismatch|gap)/)(t) || obsHas(/"willChange"/)(t) || t.actions.some((a) => a.name === 'ask_user') || /(not (supported|possible)|can.?t|cannot|add .+ image|image steps?|upload)/i.test(t.reply)) });
const planCard = () => ({ label: 'plan card (ask_user with plan) or plain gap statement', test: (t) => t.actions.some((a) => a.name === 'ask_user' && a.args && a.args.plan) || /(not (supported|possible)|can.?t|cannot)/i.test(t.reply) });
const promisesOnlyWhatRuns = () => ({ label: 'does not promise 3 images per channel or pixel-exact screenshots', test: (t) => !/(3|three) (mockup )?images (each|per)[^.?]*\b(will|i.ll)\b|exact (copy|screenshot)/i.test(t.reply) || /not|can.?t|cannot/i.test(t.reply) });
const dryStart = () => ({ label: 'run started (dry-run)', test: obsHas(/"action":"pipeline_started"[\s\S]*"dryRun":true|"dryRun":true[\s\S]*"action":"pipeline_started"/) });
const setup = (id, brand) => [
  { id: id + '0', src: 'setup', say: brand, expect: [c.called('create_rule_from_intake')] },
  { id: id + '1', src: 'setup', say: 'set up my workflow', expect: [{ label: 'workflow ready', test: (t) => t.actions.some((a) => a.name === 'apply_default_workflow' && a.ran) || /workflow/i.test(t.reply) }] },
];
const X = (id, title, brand, turns) => ({ id, title: 'Mismatch: ' + title, turns: [...setup(id, brand), ...turns] });
const B = (n) => 'My brand is EVAL-Mx' + n + ' {run}, a mobile budgeting app. Channels: Instagram and Facebook.';
SCRIPTS.push(
  X('X01', 'RD original: 3 channels, 3 mockups each, real screenshots (none attached)', B(1), [
    { id: 'X01a', src: 'RD live', say: 'website announcement for Facebook, TikTok, LinkedIn, 3 mockup images each, use my real screenshots', expect: [gapCaught(), planCard(), promisesOnlyWhatRuns(), noRunYet(), c.dryRunOnly()] },
    { id: 'X01b', src: 'RD live / confirm', say: 'User choice: yes (Yes)', expect: [c.dryRunOnly(), { label: 'no unrequested channel in the run', test: (t) => !obsHas(/"channels":\[[^\]]*instagram/)(t) }] },
  ]),
  X('X02', 'unsupported channel (Pinterest)', B(2), [
    { id: 'X02a', src: 'mismatch', say: 'post our launch on instagram and pinterest', expect: [gapCaught(), c.replyMatches(/pinterest/i, 'names Pinterest'), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X03', 'no watercolor this time', B(3), [
    { id: 'X03a', src: 'mismatch', say: 'remember I like watercolor images', expect: [c.called('remember')] },
    { id: 'X03b', src: 'mismatch', say: 'make an instagram and facebook post about our new savings goals feature, no watercolor this time', expect: [c.dryRunOnly(), { label: 'saved watercolor not applied', test: (t) => !obsHas(/"style":"watercolou?r/i)(t) && !obsHas(/Image style: watercolou?r/i)(t) }] },
  ]),
  X('X04', 'fits the workflow: run in one message', B(4), [
    { id: 'X04a', src: 'mismatch', say: 'make an instagram and facebook post announcing our new website', expect: [c.dryRunOnly(), dryStart(), { label: 'no plan card needed', test: (t) => !t.actions.some((a) => a.name === 'ask_user') }] },
  ]),
  X('X05', 'image count', B(5), [
    { id: 'X05a', src: 'mismatch', say: '5 images for instagram about our budgeting tips', expect: [gapCaught(), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X06', 'screenshots asked, none attached', B(6), [
    { id: 'X06a', src: 'mismatch', say: 'use my real screenshots for an instagram and facebook post about the app', expect: [gapCaught(), noRunYet(), c.replyMatches(/(upload|attach|screenshot)/i, 'asks for the screenshots'), c.dryRunOnly()] },
  ]),
  X('X07', 'screenshot attached: passed through', B(7), [
    { id: 'X07a', src: 'mismatch', say: 'use this screenshot for an instagram and facebook post about the app\n{asset}', before: async (ctx) => { await ctx.upload(); }, expect: [c.dryRunOnly(), { label: 'reference image passed (used >= 1)', test: (t) => obsHas(/"referenceImagesUsed":[1-9]/)(t) || obsHas(/capability_/)(t) }] },
  ]),
  { id: 'X08', title: 'Mismatch: hello (no brand)', turns: [{ id: 'X08a', src: 'mismatch', say: 'hello', expect: [c.noMutation(), noChipJson()] }] },
  X('X09', 'X/Twitter', B(9), [
    { id: 'X09a', src: 'mismatch', say: 'tweet this announcement: our app now supports shared budgets', expect: [gapCaught(), c.replyMatches(/(twitter|\bx\b)/i, 'names X/Twitter'), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X10', 'LinkedIn missing + 3 images', B(10), [
    { id: 'X10a', src: 'mismatch', say: '3 linkedin images about our team', expect: [gapCaught(), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X11', 'pixel-exact device frame', B(11), [
    { id: 'X11a', src: 'mismatch', say: 'make a mockup of our app in an iphone frame using our real screenshot for instagram and facebook\n{asset}', before: async (ctx) => { await ctx.upload(); }, expect: [gapCaught(), promisesOnlyWhatRuns(), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X12', 'only tiktok', B(12), [
    { id: 'X12a', src: 'mismatch', say: 'only tiktok this time, 1 image, about saving for travel', expect: [gapCaught(), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X13', 'Change on the plan card', B(13), [
    { id: 'X13a', src: 'mismatch', say: 'post to facebook and tiktok with 2 images each', expect: [gapCaught(), noRunYet(), c.dryRunOnly()] },
    { id: 'X13b', src: 'mismatch / change', say: 'User choice: change (Change)', expect: [noRunYet(), asks(), c.dryRunOnly()] },
  ]),
  X('X14', 'Thai mixed', B(14), [
    { id: 'X14a', src: 'mismatch', say: '\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e25\u0e07 Facebook \u0e01\u0e31\u0e1a TikTok 2 \u0e23\u0e39\u0e1b', expect: [gapCaught(), noRunYet(), c.dryRunOnly(), c.replyMatches(/[\u0e00-\u0e7f]/, 'replies in Thai')] },
  ]),
  X('X15', 'text only', B(15), [
    { id: 'X15a', src: 'mismatch', say: 'no images this time, just a text post for instagram and facebook about our new feature', expect: [c.dryRunOnly(), { label: 'no image gap invented', test: (t) => !obsHas(/add_workflow_node image_generation|Add an image step/)(t) }] },
  ]),
  X('X16', 'yes after plan', B(16), [
    { id: 'X16a', src: 'mismatch', say: 'linkedin and facebook post about our 1 million users milestone', expect: [gapCaught(), noRunYet(), c.dryRunOnly()] },
    { id: 'X16b', src: 'mismatch / yes', say: 'yes', expect: [c.dryRunOnly(), dryStart()] },
  ]),
  X('X17', 'medium + instagram', B(17), [
    { id: 'X17a', src: 'mismatch', say: 'write this up for medium and instagram', expect: [gapCaught(), c.replyMatches(/medium/i, 'names Medium'), noRunYet(), c.dryRunOnly()] },
  ]),
  X('X18', 'everywhere', B(18), [
    { id: 'X18a', src: 'mismatch', say: 'post our launch everywhere', expect: [c.dryRunOnly(), { label: 'no unsupported channel promised', test: (t) => !/(pinterest|twitter|threads)/i.test(t.reply) }] },
  ]),
);

// ---- ReAct chat fixes (2026-11-03): Facebook-only brand, one lane, one confirmation.
const channelsOf = async (ctx) => {
  const rule = await ctx.api('GET', `/rules/${ctx.ruleId}`);
  return (rule.channels ?? []).map((x) => String(x.channel ?? x).toLowerCase()).sort();
};
// A single-channel workflow is a linear graph with no lanes (toPersistableGraph -> toLinearGraph), so
// "only Facebook" means: it has nodes, and no node is laned or configured for any other channel.
const onlyChannel = (wf, ch) => (wf?.nodes?.length ?? 0) > 0 && wf.nodes.every((n) => [n.lane, n.config?.laneId, n.config?.channel].filter(Boolean).every((v) => String(v).toLowerCase() === ch));
const confirmsFor = (name) => (t) => t.observations.filter((o) => o.name === name && /"code":"confirmation_required"/.test(o.result)).length;
SCRIPTS.push(
  { id: 'RC1', title: 'Facebook-only onboarding -> default workflow -> generate -> publish with connect', turns: [
    { id: 'RC1a', src: 'issue 5', say: 'My brand is EVAL-Kop {run}, a noodle shop in Chiang Mai. We only post on Facebook.', expect: [c.called('create_rule_from_intake'), c.live('profile channels are Facebook only', async (ctx) => JSON.stringify(await channelsOf(ctx)) === '["facebook"]')] },
    { id: 'RC1b', src: 'issue 5', say: 'set up the default workflow please', expect: [{ label: 'workflow set up', test: ranTool('apply_default_workflow') }, c.live('workflow targets Facebook only', async (ctx) => onlyChannel(await ctx.workflow(), 'facebook'))] },
    { id: 'RC1c', src: 'issue 1', say: 'make a post about our new khao soi', expect: [c.called('start_generation'), c.dryRunOnly()] },
    // In dry-run no post exists, so this only proves nothing is published without a yes.
    // With a real draft it walks publish -> Yes -> connect -> publish and must ask only once.
    { id: 'RC1d', src: 'issues 3-4', say: 'publish it to facebook', next: (t) => (t.askUser ? chip(t, /yes|connect|publish/i) : null), expect: [
      c.noFakeClaim(),
      { label: 'publish confirmed at most once', test: (t) => confirmsFor('publish_now')(t) <= 1 },
    ] },
  ] },
  { id: 'RC2', title: 'Brand from a Facebook page link only', turns: [
    { id: 'RC2a', src: 'issue 5', say: 'This is EVAL-Kop2 {run}, our cafe page: https://www.facebook.com/evalkop2', expect: [c.called('create_rule_from_intake'), c.live('profile channels are Facebook only', async (ctx) => JSON.stringify(await channelsOf(ctx)) === '["facebook"]')] },
  ] },
);

// ---- Structured session state (item 2, 2026-11-03). The server returns
// res.sessionState in eval dry-run; run-chat-eval prints it per turn.
const S = (n) => 'My brand is EVAL-St' + n + ' {run}, a coffee shop in Bangkok. Channels: Instagram and Facebook. Site: https://example.com';
const ST = (id, title, n, turns) => ({ id, title: 'State: ' + title, turns: [...setup(id, S(n)), ...turns] });
const noNewOauth = () => ({ label: 'no new start_channel_oauth', test: (t) => !ranTool('start_channel_oauth')(t) });
SCRIPTS.push(
  ST('ST1', 'follow-up row between the card and Yes', 1, [
    { id: 'ST1a', src: 'state / follow-up', say: 'make a post about our iced latte', next: (t) => (t.askUser ? chip(t, /start|yes|go/i) : null), expect: [c.dryRunOnly()] },
    // The dry-run follow-up row lands between these two turns.
    { id: 'ST1b', src: 'state / follow-up', say: 'publish it to instagram', next: (t) => (t.askUser ? chip(t, /yes|publish/i) : null), expect: [
      c.noFakeClaim(),
      { label: 'publish confirmed at most once (no re-ask after Yes)', test: (t) => confirmsFor('publish_now')(t) <= 1 },
    ] },
  ]),
  ST('ST2', 'connect pending survives a detour', 2, [
    { id: 'ST2a', src: 'state / connect', say: 'connect instagram', expect: [c.either(c.called('start_channel_oauth'), c.called('check_channel_auth'))] },
    { id: 'ST2b', src: 'state / connect', say: "what's a good caption length for instagram?", expect: [c.noMutation()] },
    { id: 'ST2c', src: 'state / connect', say: 'done', expect: [c.called('check_channel_auth'), noNewOauth()] },
  ]),
  ST('ST3', 'RedNote QR then done', 3, [
    { id: 'ST3a', src: 'state / qr', say: 'connect rednote', expect: [c.either(c.called('start_channel_oauth'), c.called('check_channel_auth'))] },
    { id: 'ST3b', src: 'state / qr', say: 'done', expect: [c.called('check_channel_auth'), noNewOauth()] },
  ]),
  { id: 'ST4', title: 'State: a skipped site stays skipped', turns: [
    { id: 'ST4a', src: 'state / skip', say: 'My brand is EVAL-St4 {run}, a bakery. We post on Instagram. Our site is https://example.com', next: (t) => (t.askUser ? chip(t, /skip|no|not now/i) : null), expect: [c.called('create_rule_from_intake')] },
    { id: 'ST4b', src: 'state / skip', say: 'set up my workflow', expect: [] },
    { id: 'ST4c', src: 'state / skip', say: 'add an image step in watercolor style', expect: [] },
    { id: 'ST4d', src: 'state / skip', say: 'make a post about our croissants', next: (t) => (t.askUser ? chip(t, /start|yes|go/i) : null), expect: [c.dryRunOnly()] },
    { id: 'ST4e', src: 'state / skip', say: 'what changed so far?', expect: [c.noMutation()] },
    { id: 'ST4f', src: 'state / skip', say: 'add some images to my brand', expect: [
      { label: 'no site fetch without a new card naming the site', test: (t) => !ranTool('fetch_website_assets')(t) },
      c.either(c.called('ask_user'), c.replyMatches(/(skip|earlier|before|upload|example\.com)/i, 'recalls the skip / asks')),
    ] },
  ] },
  ST('ST5', 'recap after several tool turns', 5, [
    { id: 'ST5a', src: 'state / recap', say: 'add an image step in watercolor style', expect: [] },
    { id: 'ST5b', src: 'state / recap', say: 'make a post about our cold brew', next: (t) => (t.askUser ? chip(t, /start|yes|go/i) : null), expect: [c.dryRunOnly()] },
    { id: 'ST5c', src: 'state / recap', say: 'what did you do so far?', expect: [
      c.noMutation(),
      c.replyMatches(/(profile|brand)/i, 'mentions the brand profile'),
      c.replyMatches(/workflow/i, 'mentions the workflow'),
      c.replyMatches(/image/i, 'mentions the image step'),
      c.replyMatches(/post/i, 'mentions the post'),
    ] },
  ]),
  ST('ST6', 'the same post request beyond 7 rows', 6, [
    { id: 'ST6a', src: 'state / repeat', say: 'make a post about iced coffee', next: (t) => (t.askUser ? chip(t, /start|yes|go/i) : null), expect: [c.dryRunOnly()] },
    { id: 'ST6b', src: 'state / repeat', say: 'what is your favourite colour?', expect: [c.noMutation()] },
    { id: 'ST6c', src: 'state / repeat', say: 'how many memory notes do I have?', expect: [c.noMutation()] },
    { id: 'ST6d', src: 'state / repeat', say: 'which channels are connected?', expect: [c.noMutation()] },
    { id: 'ST6e', src: 'state / repeat', say: 'thanks, that is all for now', expect: [c.noMutation()] },
    { id: 'ST6f', src: 'state / repeat', say: 'make a post about iced coffee', expect: [{ label: 'no second run', test: (t) => !obsHas(/"action":"pipeline_started"/)(t) }, asks(), c.dryRunOnly()] },
  ]),
  { id: 'ST7', title: 'State: the goal survives onboarding', turns: [
    { id: 'ST7a', src: 'state / goal', say: 'hi', next: (t) => (t.askUser ? chip(t, /post/i) : null), expect: [c.noMutation()] },
    { id: 'ST7b', src: 'state / goal', say: 'EVAL-St7 {run}', expect: [] },
    { id: 'ST7c', src: 'state / goal', say: 'https://example.com', next: (t) => (t.askUser ? chip(t, /use|yes/i) : null), expect: [] },
    { id: 'ST7d', src: 'state / goal', say: 'yes, that industry is right', expect: [
      c.either(c.called('start_generation'), c.replyMatches(/\bpost\b/i, 'offers the post without being asked again')),
      c.dryRunOnly(),
    ] },
  ] },
  ST('ST8', 'never mind cancels the pending card', 8, [
    { id: 'ST8a', src: 'state / cancel', say: 'post to facebook and tiktok with 2 images each', expect: [noRunYet(), c.dryRunOnly()] },
    { id: 'ST8b', src: 'state / cancel', say: 'actually never mind', expect: [c.noMutation(), noRunYet()] },
    { id: 'ST8c', src: 'state / cancel', say: 'yes', expect: [noRunYet(), c.dryRunOnly()] },
  ]),
  ST('ST9', 'a stale-tab chip carries nothing', 9, [
    { id: 'ST9a', src: 'state / stale', say: 'post to facebook and tiktok with 2 images each', expect: [noRunYet(), c.dryRunOnly()] },
    { id: 'ST9b', src: 'state / stale', say: 'before that: should my posts sound fun or calm? give me buttons', expect: [c.noMutation()] },
    // The plan card's chip, sent after the newer card (an old browser tab).
    { id: 'ST9c', src: 'state / stale', say: 'User choice: start_post (Start)', expect: [noRunYet(), c.dryRunOnly()] },
  ]),
);

const goalNotFalselyDone = () => ({
  label: 'does not treat update_rule alone as done',
  test: (t) => {
    const tools = t.actions.map((a) => a.name);
    const onlySetup = tools.length > 0 && tools.every((n) => ['get_rule', 'update_rule', 'ask_user', 'list_workflows', 'remember'].includes(n));
    const updated = tools.includes('update_rule');
    const asked = tools.includes('ask_user') || tools.includes('start_generation') || tools.includes('add_workflow_node');
    if (updated && onlySetup && !asked) return false;
    return true;
  },
});
const multiImagePlanPath = () => ({
  label: 'plans multi-image via nodes or confirm (not false notPossible-only stop)',
  test: (t) => {
    const started = obsHas(/"action":"pipeline_started"/)(t);
    if (started) return t.observations.some((o) => /"dryRun":true/.test(o.result));
    const planObs = t.observations.some((o) => /"willChange"|add_workflow_node|"plan"/i.test(o.result));
    const tools = t.actions.some((a) => ['ask_user', 'add_workflow_node', 'start_generation', 'set_workflow_channels'].includes(a.name));
    const replyOk = /image steps?|add .+image|plan|confirm|start/i.test(t.reply);
    return planObs || tools || replyOk;
  },
});
const noEmptyMediaPromise = () => ({
  label: 'does not claim media uploaded when mediaUrls empty',
  test: (t) => {
    const blob = t.observations.map((o) => o.result).join('\n');
    if (/mediaUrls"\s*:\s*\[\s*\]/.test(blob) && /published|uploaded successfully/i.test(t.reply)) return false;
    return true;
  },
});

SCRIPTS.push(
  {
    id: 'P1',
    title: 'Phase1 outcomes: FB 4 images / video-before-node / empty media honesty',
    turns: [
      {
        id: 'P1-FB4a',
        src: 'RD transcript / 4 service images Facebook',
        say: 'Create a Facebook-only post with 4 distinct service images and ask me before publishing',
        expect: [multiImagePlanPath(), goalNotFalselyDone(), noRunYet(), c.dryRunOnly(), c.english()],
      },
      {
        id: 'P1-VID',
        src: 'RD transcript / video-before-node',
        say: 'Make a presenter video for Instagram',
        expect: [
          noRunYet(),
          c.either(c.called('ask_user'), c.called('get_node_config'), c.called('add_workflow_node'), c.replyMatches(/video|look|voice|node|step/i, 'mentions video setup')),
          c.dryRunOnly(),
        ],
      },
      {
        id: 'P1-MEDIA',
        src: 'RD transcript / upload empty mediaUrls',
        say: 'publish my latest draft now',
        expect: [
          noEmptyMediaPromise(),
          c.either(c.called('preview_upload'), c.called('get_upload'), c.called('ask_user'), c.replyMatches(/preview|media|upload|draft|connect/i, 'checks upload readiness')),
        ],
      },
    ],
  },
);

SCRIPTS.push(
  {
    id: 'WA1',
    title: 'Workflow awareness: FB 4 images must use willChange (myu mirror), not impossible / wait',
    turns: [
      {
        id: 'WA1a',
        src: 'myu / 4 service images one FB post',
        say: 'Create one Facebook post with 4 distinct service images for our beauty brand',
        next: (t) => (t.askUser ? chip(t, /yes|start_post|start/i) : null),
        expect: [
          {
            label: 'does not claim 4 images impossible',
            test: (t) => !/\b(can'?t|cannot|impossible|not possible|not supported|unable to)\b.{0,80}\b(4|four)\b.{0,40}\bimages?\b/i.test(t.reply)
              && !t.observations.some((o) => o.name === 'ask_user' && /false_impossibility|can'?t do 4|not possible.{0,40}4/i.test(o.result)),
          },
          {
            label: 'plans willChange N image steps or adds nodes / starts',
            test: (t) => {
              const blob = t.observations.map((o) => o.result).join('\n');
              const will = /willChange|Add \d+ image steps|add_workflow_node/i.test(blob);
              const tools = t.actions.some((a) => ['ask_user', 'add_workflow_node', 'start_generation'].includes(a.name));
              return will || tools;
            },
          },
          {
            label: 'after yes (auto-chip) does not stop on setup-only / wait',
            test: (t) => {
              if (/wait (until|for|till).{0,40}(four|4).{0,20}image/i.test(t.reply)) return false;
              const tools = t.actions.map((a) => a.name);
              // If no ask_user happened, only check the first-turn plan path.
              if (!(t.followUps && t.followUps.length)) return true;
              const setupOnly = tools.length > 0 && tools.every((n) =>
                ['update_rule', 'ask_user', 'get_rule', 'list_workflows', 'remember'].includes(n));
              if (setupOnly) return false;
              return t.actions.some((a) =>
                ['add_workflow_node', 'start_generation', 'set_workflow_channels', 'apply_default_workflow'].includes(a.name),
              ) || /image step|starting|generat/i.test(t.reply);
            },
          },
          c.dryRunOnly(),
          c.english(),
        ],
      },
    ],
  },
);
