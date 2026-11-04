import { correctFakeStartClaim } from './tool-calling-loop';
import { confirmedPlanChain, unrequestedProfileChange } from './tool-guards.util';

const card = [{ type: 'observation', name: 'ask_user', toolCallId: 'x', result: JSON.stringify({ action: 'ask_user', type: 'single', question: 'OK?', options: [{ id: 'start_post', label: 'Start post' }, { id: 'not_now', label: 'Not now' }] }) }];

describe('plan chain guard', () => {
  it('allows the chain only after Start post', () => {
    expect(confirmedPlanChain([{ role: 'assistant', content: 'OK?', steps: card }, { role: 'user', content: 'User choice: start_post (Start post)' }])?.has('start_generation')).toBe(true);
    expect(confirmedPlanChain([{ role: 'assistant', content: 'OK?', steps: card }, { role: 'user', content: 'User choice: not_now (Not now)' }])).toBeNull();
    expect(confirmedPlanChain([{ role: 'user', content: 'start post' }])).toBeNull();
  });
  it('blocks update_rule when the user did not ask for a profile change', () => {
    expect(unrequestedProfileChange('I want to announce that website')).toMatch(/not_requested/);
    expect(unrequestedProfileChange('change the tone to playful')).toBeNull();
  });
});

describe('correctFakeStartClaim', () => {
  it('never rewrites a turn that reports a finished run', () => {
    const steps = [{ type: 'action', name: 'pipeline_result', args: {}, toolCallId: 'r' }, { type: 'observation', name: 'pipeline_result', toolCallId: 'r', result: '{"ok":true,"action":"pipeline_result","status":"completed"}' }] as never;
    expect(correctFakeStartClaim('Your post is ready. I started from your welcome idea.', steps)).toBe('Your post is ready. I started from your welcome idea.');
  });
  it('still catches a same-turn fake start', () => {
    expect(correctFakeStartClaim('I started your post.', [])).toMatch(/hasn't started/);
  });
});
