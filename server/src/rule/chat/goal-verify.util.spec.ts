import {
  goalContinueInstruction,
  mediaCountFromObservations,
  shouldForceContinueOnGoal,
  verifyGoalAcceptance,
} from './goal-verify.util';
import { inferGoalAcceptance } from './goal-acceptance.util';

describe('mediaCountFromObservations', () => {
  it('reads ordered mediaUrls from get_upload', () => {
    const n = mediaCountFromObservations([
      {
        name: 'get_upload',
        result: JSON.stringify({
          channels: [
            {
              channel: 'facebook',
              included: true,
              mediaUrls: ['a', 'b', 'c', 'd'],
            },
          ],
        }),
      },
    ]);
    expect(n).toBe(4);
  });
});

describe('verifyGoalAcceptance', () => {
  const acceptance = inferGoalAcceptance(
    'Create a Facebook post with 4 service images and ask me before publishing',
  );

  it('preference-only (no goal) completes', () => {
    const r = verifyGoalAcceptance({
      toolNamesThisTurn: ['update_rule'],
      observations: [{ name: 'update_rule', result: '{"ok":true}' }],
    });
    expect(r.status).toBe('completed');
    expect(shouldForceContinueOnGoal(r)).toBe(false);
  });

  it('update_rule-only on make_post is in_progress (false completion)', () => {
    const r = verifyGoalAcceptance({
      goalKind: 'make_post',
      acceptance,
      userText: 'Create a Facebook post with 4 service images',
      toolNamesThisTurn: ['get_rule', 'update_rule'],
      observations: [
        { name: 'get_rule', result: '{}' },
        { name: 'update_rule', result: '{"ok":true}' },
      ],
    });
    expect(r.status).toBe('in_progress');
    expect(shouldForceContinueOnGoal(r)).toBe(true);
    expect(r.unmet.length).toBeGreaterThan(0);
  });

  it('ask_user mid plan is awaiting_input (no force)', () => {
    const r = verifyGoalAcceptance({
      goalKind: 'make_post',
      acceptance,
      userText: 'Create a Facebook post with 4 images',
      toolNamesThisTurn: ['update_rule', 'ask_user'],
      observations: [{ name: 'ask_user', result: '{"ok":true,"question":"Start?"}' }],
    });
    expect(r.status).toBe('awaiting_input');
    expect(shouldForceContinueOnGoal(r)).toBe(false);
  });

  it('four mediaUrls satisfies imageCount; askPublish awaits approval', () => {
    const r = verifyGoalAcceptance({
      goalKind: 'make_post',
      acceptance,
      userText: 'Create a Facebook post with 4 service images and ask before publishing',
      toolNamesThisTurn: ['get_upload'],
      observations: [
        {
          name: 'get_upload',
          result: JSON.stringify({
            channels: [
              {
                channel: 'facebook',
                included: true,
                mediaUrls: ['1', '2', '3', '4'],
              },
            ],
          }),
        },
      ],
      facts: { hasDraft: true, uploadChannels: ['facebook'], mediaUrlCount: 4 },
    });
    expect(r.status).toBe('awaiting_approval');
    expect(shouldForceContinueOnGoal(r)).toBe(false);
  });

  it('partial media after start is in_progress', () => {
    const r = verifyGoalAcceptance({
      goalKind: 'make_post',
      acceptance,
      userText: 'Facebook 4 images',
      toolNamesThisTurn: ['start_generation'],
      observations: [
        {
          name: 'start_generation',
          result: JSON.stringify({ ok: true, action: 'pipeline_started' }),
        },
      ],
      facts: { activeRun: true, hasDraft: false, mediaUrlCount: 0 },
    });
    expect(r.status).toBe('in_progress');
    expect(r.unmet.some((u) => /4 images/i.test(u))).toBe(true);
  });
});

describe('goalContinueInstruction', () => {
  it('lists unmet criteria', () => {
    expect(goalContinueInstruction(['4 images', 'Facebook draft'])).toMatch(
      /Still unmet: 4 images; Facebook draft/,
    );
  });
});
