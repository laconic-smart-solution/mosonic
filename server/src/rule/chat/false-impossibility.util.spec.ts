import { falseImpossibilityAskBlock } from './false-impossibility.util';

describe('falseImpossibilityAskBlock', () => {
  const nodes = [
    { type: 'text_generation' },
    { type: 'adapt', lane: 'facebook' },
    { type: 'image_generation', lane: 'facebook' },
  ];
  const plan = {
    willChange: [
      'Add 4 image steps so one run produces 4 images (each step = 1 image)',
    ],
    notPossible: [] as string[],
  };

  it('blocks ask_user that claims multi-image is impossible when willChange is open', () => {
    const blocked = falseImpossibilityAskBlock({
      question: "I can't do 4 images in one Facebook post yet. Want to wait?",
      options: [
        { id: 'wait', label: 'Wait' },
        { id: 'ok', label: 'OK' },
      ],
      plan,
    });
    expect(blocked).toMatch(/false_impossibility/);
    expect(blocked).toMatch(/willChange/);
  });

  it('allows a proper Yes/Change plan card for willChange', () => {
    expect(
      falseImpossibilityAskBlock({
        question: 'Apply these workflow changes, then start?',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'change', label: 'Change' },
        ],
        plan,
      }),
    ).toBeNull();
  });

  it('blocks via live preflight when no plan but request needs N image steps', () => {
    const blocked = falseImpossibilityAskBlock({
      question: 'Four images in one post is not possible. Continue with one?',
      options: [
        { id: 'one', label: 'One image' },
        { id: 'cancel', label: 'Cancel' },
      ],
      nodes,
      userText: 'Create a Facebook post with 4 service images',
    });
    expect(blocked).toMatch(/false_impossibility/);
  });

  it('does not block when notPossible is non-empty (real gap)', () => {
    expect(
      falseImpossibilityAskBlock({
        question: 'Medium is not supported. Post to Facebook instead?',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        plan: {
          willChange: [],
          notPossible: ['Medium: not a supported channel'],
        },
      }),
    ).toBeNull();
  });
});
