import { planBeforeSetupChange, startAfterSetupChange, unrequestedProfileChange, waivedRecently, waivesQuestions } from './tool-guards.util';
import { TOOL_ERROR_NEXT } from './tool-error.util';

const fbArgs = { channels: [{ channel: 'facebook' }] };

describe('"do it yourself" Facebook announcement (Beauty Phoo session)', () => {
  it('detects waivers', () => {
    expect(waivesQuestions("don't ask me do it yourself all the way to publish the post, don't ask me anything")).toBe(true);
    expect(waivesQuestions("build by urself I won't give u info")).toBe(true);
    expect(waivesQuestions("u decide the brand I want to get started")).toBe(true);
    expect(waivesQuestions('make a website announcement post and upload on facebook')).toBe(false);
    expect(waivedRecently([{ role: 'user', content: 'do it yourself' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'done' }])).toBe(true);
  });

  it('turn 1: brand with no channels may add the named channel (no plan_first deadlock with no_channels)', () => {
    const userText = 'make a website announcement post and upload on facebook';
    expect(planBeforeSetupChange({ name: 'update_rule', args: fbArgs, userText, confirmed: false, brandChannels: [] })).toBeNull();
    // Brand already has channels: the plan card still comes first.
    expect(planBeforeSetupChange({ name: 'update_rule', args: fbArgs, userText, confirmed: false, brandChannels: ['instagram'] })).toMatch(/plan_first/);
  });

  it('turn 2: waiver lets update_rule add the pending post channel', () => {
    const userText = "don't ask me do it yourself all the way to publish the post, don't ask me anything";
    expect(unrequestedProfileChange(userText)).toMatch(/not_requested/);
    expect(unrequestedProfileChange(userText, { args: fbArgs, waived: true, brandChannels: [] })).toBeNull();
    expect(unrequestedProfileChange(userText, { args: { tone: 'x' }, waived: true })).toMatch(/not_requested/);
    expect(unrequestedProfileChange('go', { args: fbArgs, brandChannels: [], pendingPostText: 'post it on facebook' })).toBeNull();
    expect(unrequestedProfileChange('Broad IT trends', { args: { brand: { industry: 'IT' } }, blankBrand: true })).toBeNull();
    expect(unrequestedProfileChange('build by urself I won\'t give u info', { args: { brand: { industry: 'IT' } }, blankBrand: true })).toBeNull();
    expect(planBeforeSetupChange({ name: 'set_workflow_channels', args: {}, userText: 'make a facebook post, do it yourself', confirmed: false, brandChannels: ['instagram'], waived: true })).toBeNull();
  });

  it('waiver does not hit confirm_start after setup', () => {
    const steps = [{ type: 'action', name: 'update_rule', args: fbArgs, toolCallId: 'a' }, { type: 'observation', name: 'update_rule', toolCallId: 'a', result: '{"ok":true}' }] as never;
    expect(startAfterSetupChange('start_generation', steps, true)).toBeNull();
  });

  it('no_channels tells the model the exact next tools', () => {
    expect(TOOL_ERROR_NEXT.no_channels).toMatch(/update_rule/);
    expect(TOOL_ERROR_NEXT.no_channels).toMatch(/start_generation/);
  });
});
