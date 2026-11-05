import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { confirmationPromptFor } from '../tools/tool-guards.util';
import type { LiveFacts } from './live-facts.util';
import {
  MAX_APPROVALS,
  MAX_PENDING,
  MAX_RECENT,
  OBSERVATION_ACTIONS,
  RUN_TTL_MS,
  SESSION_STATE_MAX_CHARS,
  bootstrapState,
  emptyState,
  isFollowUpRow,
  parseState,
  readState,
  reconcile,
  reduceFollowUp,
  reduceObservation,
  reduceTurnSteps,
  reduceUserMessage,
  renderSessionState,
  startedPostRequests,
  statePendingFor,
} from './session-state.util';
import type { ChatSessionState } from './session-state.types';

const publishArgs = { contentId: 'content-1', channels: ['facebook'] };
const cardRow = {
  role: 'assistant',
  content: 'Publish this draft now?',
  steps: [
    { type: 'action', name: 'publish_now', args: publishArgs, toolCallId: 'p1' },
    { type: 'observation', name: 'publish_now', toolCallId: 'p1', result: confirmationPromptFor('publish_now', publishArgs) },
  ],
};
const followUpRow = {
  role: 'assistant',
  content: 'Your post finished.',
  steps: [
    { type: 'action', name: 'pipeline_result', args: { pipelineId: 'pl-1' }, toolCallId: 'pipeline-result-pl-1' },
    { type: 'observation', name: 'pipeline_result', toolCallId: 'pipeline-result-pl-1', result: '{"ok":true,"action":"pipeline_result","pipelineId":"pl-1","status":"completed","hasImage":true}' },
  ],
};
const askObs = (question: string, ids: string[]) => ({
  name: 'ask_user',
  result: JSON.stringify({ ok: true, action: 'ask_user', question, options: ids.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })) }),
});
const facts = (over: Partial<LiveFacts> = {}): LiveFacts => ({
  workflow: { status: 'ready', steps: '' },
  activeRun: null,
  latestPost: { contentId: 'content-1', status: 'draft', hasImage: true },
  upload: null,
  accounts: [],
  memoryCount: 0,
  ...over,
});

describe('reduceUserMessage', () => {
  it('a chip matching the stored card is positive and records the approval', () => {
    const s = readState([{ role: 'user', content: 'publish it' }, cardRow]).state;
    expect(s.pending).toEqual([expect.objectContaining({ kind: 'ask', confirmFor: 'publish_now', optionIds: ['yes', 'no'] })]);
    expect(s.goal).toMatchObject({ kind: 'publish', detail: 'facebook' });
    const { state, resolution } = reduceUserMessage(s, 'User choice: yes (Yes)');
    expect(resolution).toMatchObject({ matched: true, positive: true, negative: false });
    expect(state.pending.some((p) => p.kind === 'ask')).toBe(false);
    expect(state.approvals).toEqual([
      expect.objectContaining({ tool: 'publish_now', contentId: 'content-1', confirmedTurn: 2, expiresTurn: 5, args: publishArgs }),
    ]);
    expect(statePendingFor(state, resolution)).toMatchObject({ askConfirmFor: 'publish_now', approvalTools: ['publish_now'] });
  });

  it('a typed label matches too; No clears approvals, connects and chains', () => {
    const s = readState([cardRow]).state;
    expect(reduceUserMessage(s, 'yes').resolution.positive).toBe(true);
    const no = reduceUserMessage(s, 'User choice: no (No)');
    expect(no.resolution).toMatchObject({ matched: true, positive: false, negative: true });
    expect(no.state.approvals).toEqual([]);
  });

  it('an unrelated chip (old tab) does not match the stored card', () => {
    const s = readState([cardRow]).state;
    const r = reduceUserMessage(s, 'User choice: start_post (Start)');
    expect(r.resolution.matched).toBe(false);
    expect(r.state.approvals).toEqual([]);
    expect(r.state.pending.some((p) => p.kind === 'ask')).toBe(false);
  });

  it('free text clears the ask without approving', () => {
    const s = reduceObservation(emptyState(), askObs('Which tone?', ['fun', 'calm']));
    const r = reduceUserMessage(s, 'what do you suggest?');
    expect(r.state.pending).toEqual([]);
    expect(r.resolution.matched).toBe(false);
  });

  it('a bare "yes please" after idea buttons picks the first idea (not a confirmation)', () => {
    const s = reduceObservation(emptyState(), askObs('Which idea?', ['launch_story', 'behind_scenes', 'tips']));
    const r = reduceUserMessage(s, 'yes please');
    expect(r.resolution).toMatchObject({ matched: true, positive: false, firstOption: 'launch_story' });
    expect(r.state.approvals).toEqual([]);
    expect(renderSessionState(r.state, { answeredAsk: r.resolution.ask, firstOption: r.resolution.firstOption })).toContain(
      'the latest message answers it: the first option "launch_story"',
    );
    // Yes/no cards and bare "ok" keep the old behaviour.
    expect(reduceUserMessage(reduceObservation(emptyState(), askObs('Start?', ['start_post', 'not_now'])), 'yes').resolution.firstOption).toBeUndefined();
    expect(reduceUserMessage(s, 'ok').resolution.matched).toBe(false);
  });

  it('remembers choices and goal chips', () => {
    let s = reduceObservation(emptyState(), askObs('Should I include images?', ['yes', 'no']));
    s = reduceUserMessage(s, 'User choice: no (No)').state;
    expect(s.choices).toEqual([expect.objectContaining({ key: 'images', value: 'no' })]);
    s = reduceObservation(s, askObs('What do you want to do?', ['make_post', 'setup_brand']));
    s = reduceUserMessage(s, 'User choice: make_post (Make_post)').state;
    expect(s.goal).toMatchObject({ kind: 'make_post' });
  });

  it('expires approvals, connects, chains and goals', () => {
    let s = readState([cardRow]).state;
    s = reduceUserMessage(s, 'yes').state; // turn 2, expires 5
    s = reduceObservation(s, { name: 'start_channel_oauth', args: { channel: 'facebook' }, result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' });
    expect(s.pending).toEqual([expect.objectContaining({ kind: 'connect', channel: 'facebook', via: 'oauth' })]);
    expect(s.approvals[0].detourChannels).toEqual(['facebook']);
    for (let i = 0; i < 3; i++) s = reduceUserMessage(s, 'hmm').state; // turn 5
    expect(s.approvals).toHaveLength(1);
    expect(s.pending).toHaveLength(1);
    s = reduceUserMessage(s, 'hmm').state; // turn 6
    expect(s.approvals).toEqual([]);
    expect(s.pending).toEqual([]);
    for (let i = 0; i < 10; i++) s = reduceUserMessage(s, 'hmm').state;
    expect(s.goal).toBeUndefined();
  });
});

describe('reduceObservation', () => {
  const yes = () => reduceUserMessage(readState([cardRow]).state, 'yes').state;

  it('the tool consumes its approval; another mutating tool clears it; the connect detour keeps it', () => {
    const detour = reduceObservation(yes(), { name: 'start_channel_oauth', result: '{"ok":true,"action":"start_oauth","platform":"facebook"}' });
    expect(detour.approvals).toHaveLength(1);
    const used = reduceObservation(yes(), { name: 'publish_now', args: publishArgs, result: '{"ok":true,"action":"publish_started"}' });
    expect(used.approvals).toEqual([]);
    expect(used.goal).toBeUndefined();
    expect(used.recent.at(-1)?.text).toBe('publish started (facebook)');
    const other = reduceObservation(yes(), { name: 'update_rule', result: '{"ok":true}' });
    expect(other.approvals).toEqual([]);
  });

  it('a failed tracked tool lands in Done as failed, except confirmation cards and read-only codes', () => {
    let s = reduceObservation(emptyState(), { name: 'publish_now', result: '{"ok":false,"code":"no_account"}' });
    expect(s.recent.at(-1)?.text).toBe('publish_now failed: no_account');
    s = reduceObservation(emptyState(), { name: 'approve_content', result: '{"ok":false,"code":"confirmation_required"}' });
    expect(s.recent).toEqual([]);
    s = reduceObservation(emptyState(), { name: 'list_channels', result: '{"ok":false,"code":"x"}' });
    expect(s.recent).toEqual([]);
  });

  it('a confirmation card from a non-ask tool becomes the pending ask', () => {
    const s = reduceObservation(emptyState(), { name: 'approve_content', args: { contentId: 'c' }, result: confirmationPromptFor('approve_content', { contentId: 'c' }) });
    expect(s.pending).toEqual([expect.objectContaining({ kind: 'ask', confirmFor: 'approve_content', args: { contentId: 'c' } })]);
  });

  it('pipeline_started adds a run with the request key; cancel removes it', () => {
    let s = reduceUserMessage(emptyState(), 'Make a post about iced coffee!').state;
    s = reduceTurnSteps(
      s,
      [
        { type: 'action', name: 'start_generation', args: {}, toolCallId: 's1' },
        { type: 'observation', name: 'start_generation', toolCallId: 's1', result: '{"ok":true,"action":"pipeline_started","pipelineId":"pl-1"}' },
      ],
      { userText: 'Make a post about iced coffee!', now: 1000 },
    );
    expect(s.pending).toEqual([expect.objectContaining({ kind: 'run', pipelineId: 'pl-1', announced: false, at: 1000 })]);
    expect(startedPostRequests(s)).toHaveLength(1);
    s = reduceObservation(s, { name: 'cancel_pipeline', result: '{"ok":true,"action":"pipeline_cancelled","pipelineId":"pl-1"}' });
    expect(s.pending).toEqual([]);
    expect(s.recent.at(-1)?.text).toBe('run cancelled');
  });

  it('a start_post chip adds the plan chain, dropped once its last tool ran', () => {
    let s = reduceObservation(emptyState(), {
      name: 'ask_user',
      result: JSON.stringify({ ok: true, action: 'ask_user', question: 'Plan ok?', options: [{ id: 'start_post', label: 'Start' }, { id: 'change', label: 'Change' }] }),
    });
    const r = reduceUserMessage(s, 'User choice: start_post (Start)');
    expect(r.resolution.chain).not.toBeNull();
    s = r.state;
    const chain = s.pending.find((p) => p.kind === 'chain');
    expect(chain).toBeDefined();
    const last = (chain as { tools: string[] }).tools.at(-1) as string;
    s = reduceObservation(s, { name: last, result: '{"ok":true,"action":"pipeline_started","pipelineId":"pl-2"}' });
    expect(s.pending.some((p) => p.kind === 'chain')).toBe(false);
  });
});

describe('follow-up rows', () => {
  it('are detected by their first step', () => {
    expect(isFollowUpRow(followUpRow)).toBe(true);
    expect(isFollowUpRow(cardRow)).toBe(false);
  });

  it('keep the ask (and the yes still approves) - replayed', () => {
    const s = readState([cardRow, followUpRow]).state;
    expect(s.pending).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ask', confirmFor: 'publish_now' })]));
    expect(s.turn).toBe(0);
    const r = reduceUserMessage(s, 'User choice: yes (Yes)');
    expect(r.resolution.positive).toBe(true);
    expect(r.state.approvals[0]).toMatchObject({ tool: 'publish_now' });
  });

  it('keep the ask - stored snapshot on the follow-up row', () => {
    const before = readState([cardRow]).state;
    const stored = reduceFollowUp(before, followUpRow.steps);
    const s = readState([cardRow, { ...followUpRow, state: stored }]);
    expect(s.source).toBe('stored');
    expect(reduceUserMessage(s.state, 'yes').resolution.positive).toBe(true);
  });

  it('keep approvals and mark the run announced; reconcile then drops it', () => {
    let s = reduceObservation(emptyState(), { name: 'start_generation', result: '{"ok":true,"action":"pipeline_started","pipelineId":"pl-1"}' });
    s = reduceTurnSteps(s, cardRow.steps);
    s = reduceUserMessage(s, 'yes').state;
    s = reduceFollowUp(s, followUpRow.steps);
    expect(s.approvals).toHaveLength(1);
    expect(s.pending).toEqual([expect.objectContaining({ kind: 'run', announced: true })]);
    expect(s.recent.at(-1)?.text).toBe('run completed, draft has an image');
    expect(reconcile(s, facts()).pending).toEqual([]);
    expect(reconcile(s, facts({ activeRun: { pipelineId: 'pl-1', status: 'running' } })).pending).toHaveLength(1);
  });
});

describe('readState / parseState', () => {
  it('rejects malformed or other-version snapshots (bootstrap instead)', () => {
    expect(parseState({ ...emptyState(), v: 2 })).toBeNull();
    expect(parseState({ ...emptyState(), pending: [{ kind: 'weird', turn: 1 }] })).toBeNull();
    expect(parseState('nope')).toBeNull();
    expect(parseState(emptyState())).toEqual(emptyState());
    const r = readState([{ ...cardRow, state: { v: 99 } }]);
    expect(r.source).toBe('bootstrap');
    expect(r.state.pending).toHaveLength(1);
  });

  it('replays rows after the snapshot (a failed turn leaves a lone user row)', () => {
    const stored: ChatSessionState = { ...emptyState(), turn: 3 };
    const r = readState([
      { role: 'assistant', content: 'a', state: stored },
      { role: 'user', content: 'this turn failed' },
    ]);
    expect(r.source).toBe('stored');
    expect(r.state.turn).toBe(4);
  });

  it('bootstrap ignores stored state', () => {
    expect(bootstrapState([{ role: 'assistant', content: 'a', state: { ...emptyState(), turn: 9 } }]).turn).toBe(0);
  });
});

describe('reconcile', () => {
  it('derives the stage', () => {
    expect(reconcile(emptyState(), null).stage).toBe('no_brand');
    expect(reconcile(emptyState(), facts({ workflow: null })).stage).toBe('brand_no_workflow');
    expect(reconcile(emptyState(), facts({ latestPost: null })).stage).toBe('workflow_no_post');
    expect(reconcile(emptyState(), facts({ activeRun: { pipelineId: 'p', status: 'running' } })).stage).toBe('run_active');
    expect(reconcile(emptyState(), facts()).stage).toBe('post_ready');
  });

  it('drops connected channels, old runs, dry-run ids from earlier turns, approvals for another post', () => {
    const s: ChatSessionState = {
      ...emptyState(),
      turn: 2,
      pending: [
        { kind: 'connect', turn: 1, channel: 'facebook', via: 'oauth' },
        { kind: 'run', turn: 2, pipelineId: 'old', announced: false, at: 0 },
        { kind: 'run', turn: 1, pipelineId: 'dryrun-1', announced: false },
      ],
      approvals: [{ tool: 'publish_now', argsKey: '{}', contentId: 'content-0', confirmedTurn: 2, expiresTurn: 5 }],
    };
    const out = reconcile(s, facts({ accounts: [{ channel: 'facebook', label: 'facebook', connected: true }] }), RUN_TTL_MS + 1);
    expect(out.pending).toEqual([]);
    expect(out.approvals).toEqual([]);
  });

  it('binds this turn\'s unbound approval to the latest post', () => {
    const s: ChatSessionState = { ...emptyState(), turn: 2, approvals: [{ tool: 'approve_content', argsKey: '{}', confirmedTurn: 2, expiresTurn: 5 }] };
    expect(reconcile(s, facts()).approvals[0].contentId).toBe('content-1');
  });

  it('uses the same TTL as the run watcher', () => {
    // Read from source: importing the service pulls ESM-only deps into jest.
    const src = readFileSync(join(__dirname, 'chat-pipeline-followup.service.ts'), 'utf8');
    const m = /export const RUN_WATCH_TTL_SEC = ([\d\s*]+);/.exec(src);
    expect(m).not.toBeNull();
    const sec = (m as RegExpExecArray)[1].split('*').reduce((a, b) => a * Number(b.trim()), 1);
    expect(RUN_TTL_MS).toBe(sec * 1000);
  });
});

describe('caps and render', () => {
  it('caps every list', () => {
    let s = emptyState();
    for (let i = 0; i < 10; i++) {
      s = reduceObservation(s, { name: 'start_generation', result: JSON.stringify({ ok: true, action: 'pipeline_started', pipelineId: `p${i}` }) });
    }
    expect(s.pending.length).toBeLessThanOrEqual(MAX_PENDING);
    expect(s.recent.length).toBeLessThanOrEqual(MAX_RECENT);
    expect(s.approvals.length).toBeLessThanOrEqual(MAX_APPROVALS);
  });

  it('renders nothing for a fresh session, and stays within the budget', () => {
    expect(renderSessionState(emptyState())).toBe('');
    let s = emptyState();
    for (let i = 0; i < 12; i++) {
      s = reduceObservation(s, askObs(`A very long question number ${i} ${'x'.repeat(150)}?`, ['one', 'two', 'three']));
      s = reduceUserMessage(s, 'User choice: one (One)').state;
      s = reduceObservation(s, { name: 'remember', result: `{"ok":true,"note":"${'y'.repeat(200)}"}` });
    }
    const text = renderSessionState(s);
    expect(text.startsWith('## Session state (server-kept; earlier turns)')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(SESSION_STATE_MAX_CHARS);
  });

  it('marks the answered ask', () => {
    const s = readState([cardRow]).state;
    const r = reduceUserMessage(s, 'yes');
    const text = renderSessionState(reconcile(r.state, facts()), { answeredAsk: r.resolution.ask });
    expect(text).toContain('the latest message answers it');
    expect(text).toContain('Approvals: publish_now');
  });
});

describe('OBSERVATION_ACTIONS exhaustiveness', () => {
  function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return tsFiles(p);
      return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });
  }

  it('lists every action a tool emits', () => {
    const emitted = new Set<string>();
    for (const file of [...tsFiles(join(__dirname, '../tools')), ...tsFiles(__dirname)]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/action:\s*['"]([a-z_]+)['"]/g)) emitted.add(m[1]);
    }
    expect(emitted.size).toBeGreaterThan(10);
    const missing = [...emitted].filter((a) => !(a in OBSERVATION_ACTIONS));
    expect(missing).toEqual([]);
  });
});
