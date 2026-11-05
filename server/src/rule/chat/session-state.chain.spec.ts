import { emptyState, reduceLoopOutcome, reduceUserMessage, renderSessionState, statePendingFor } from './session-state.util';

const withChain = () =>
  reduceLoopOutcome({ ...emptyState(), turn: 1 }, { ran: ['a'], failed: ['c'], notRun: ['b', 'c'], stopReason: 'answered' });

describe('not_run PendingChain (Issue 4)', () => {
  it('persists notRun as a not_run chain without failed tools', () => {
    const s = withChain();
    expect(s.pending).toEqual([{ kind: 'chain', turn: 1, tools: ['b'], source: 'not_run' }]);
    expect(renderSessionState(s)).toContain('NOT DONE yet (from t1): b');
    expect(statePendingFor(s).chainTools).toEqual(['b']);
  });

  it('a stall or an empty notRun clears the chain', () => {
    expect(reduceLoopOutcome(withChain(), { ran: [], failed: [], notRun: ['b'], stopReason: 'stall' }).pending).toEqual([]);
    expect(reduceLoopOutcome(withChain(), { ran: ['b'], failed: [], notRun: [], stopReason: 'answered' }).pending).toEqual([]);
    expect(reduceLoopOutcome(withChain(), undefined).pending).toHaveLength(1);
  });

  it.each(['yes', 'continue', 'go ahead', 'Allow once', 'ok'])('"%s" continues the chain', (text) => {
    const { state, resolution } = reduceUserMessage(withChain(), text);
    expect(resolution.chain && [...resolution.chain]).toEqual(['b']);
    expect(state.pending).toHaveLength(1);
  });

  it('a positive chip on a pending card (allow-once / Yes) continues the chain', () => {
    const s = withChain();
    s.pending.push({ kind: 'ask', turn: 1, question: 'Publish?', optionIds: ['yes', 'no'], confirmFor: 'publish_now' });
    const { resolution } = reduceUserMessage(s, 'yes');
    expect(resolution.positive).toBe(true);
    expect(resolution.chain && [...resolution.chain]).toEqual(['b']);
  });

  it.each(['no', 'make a post about cats instead'])('"%s" drops the chain', (text) => {
    const { state, resolution } = reduceUserMessage(withChain(), text);
    expect(resolution.chain).toBeNull();
    expect(state.pending.some((p) => p.kind === 'chain')).toBe(false);
  });

  it('a plan chain (start_post) is not touched by topic changes', () => {
    const s = { ...emptyState(), turn: 1, pending: [{ kind: 'chain' as const, turn: 1, tools: ['apply_default_workflow'] }] };
    expect(reduceUserMessage(s, 'something else').state.pending).toHaveLength(1);
  });
});