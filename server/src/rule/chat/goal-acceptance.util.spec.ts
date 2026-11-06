import {
  falseCompletionOnSetupOnly,
  inferGoalAcceptance,
} from './goal-acceptance.util';

describe('inferGoalAcceptance', () => {
  it('captures facebook + 4 images + ask publish', () => {
    const a = inferGoalAcceptance(
      'Make a Facebook post with 4 service images and ask me before publishing',
    );
    expect(a?.channels).toEqual(['facebook']);
    expect(a?.imageCount).toBe(4);
    expect(a?.askPublish).toBe(true);
    expect(a?.criteria?.some((c) => /4 distinct/i.test(c))).toBe(true);
  });
});

describe('falseCompletionOnSetupOnly', () => {
  it('flags update_rule-only after a create request', () => {
    const reason = falseCompletionOnSetupOnly({
      goalKind: 'make_post',
      userText: 'Create a Facebook post with 4 images',
      toolNamesThisTurn: ['get_rule', 'update_rule'],
    });
    expect(reason).toMatch(/Goal not done/i);
  });

  it('allows ask_user plan confirm mid-flight', () => {
    expect(
      falseCompletionOnSetupOnly({
        goalKind: 'make_post',
        userText: 'Create a Facebook post with 4 images',
        toolNamesThisTurn: ['get_rule', 'update_rule', 'ask_user'],
      }),
    ).toBeNull();
  });

  it('allows start_generation', () => {
    expect(
      falseCompletionOnSetupOnly({
        goalKind: 'make_post',
        userText: 'Create a Facebook post',
        toolNamesThisTurn: ['update_rule', 'start_generation'],
      }),
    ).toBeNull();
  });
});
