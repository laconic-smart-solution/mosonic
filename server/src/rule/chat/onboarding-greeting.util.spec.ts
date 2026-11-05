import { buildGreetingResult, isBareGreeting, sanitizeReply, stripChipJson } from './onboarding-greeting.util';

describe('onboarding greeting', () => {
  it('detects bare greetings in en/th/zh/my', () => {
    for (const t of ['hello', 'hi', 'Hey!', 'hi there', '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e04\u0e23\u0e31\u0e1a', '\u4f60\u597d', '\u1019\u1004\u103a\u1039\u1002\u101c\u102c\u1015\u102b']) expect(isBareGreeting(t)).toBe(true);
  });
  it('ignores greetings with brand info or a task', () => {
    for (const t of ["hello I'm Mew, we sell collars", 'hi make a post', 'https://x.com']) expect(isBareGreeting(t)).toBe(false);
  });
  it('builds localized ask_user chips without tokens', () => {
    const r = buildGreetingResult('\u4f60\u597d');
    const obs = r.steps[1] as { result: string };
    const p = JSON.parse(obs.result);
    expect(p.action).toBe('ask_user');
    expect(p.options).toHaveLength(4);
    expect(p.options[0].label).toMatch(/[\u4e00-\u9fff]/);
    expect(r.usage.inputTokens).toBe(0);
    expect(buildGreetingResult('hello').finalMessage.content).toMatch(/set up your brand/);
  });
  it('strips chip JSON from reply text', () => {
    expect(stripChipJson('Welcome!   {"type":"single","question":"Where?","options":[{"id":"a","label":"A"}]}')).toBe('Welcome!');
    expect(stripChipJson('{"type":"single","question":"Where?","options":[]}')).toBe('Where?');
    expect(stripChipJson('plain reply')).toBe('plain reply');
  });
});

describe('sanitizeReply', () => {
  it('removes turn-limit talk', () => {
    expect(sanitizeReply("I saved the watercolor style. I couldn't add the image step in the same turn, so send one more message and I'll add it next.")).toBe('I saved the watercolor style.');
    expect(sanitizeReply('Done - added the image step.')).toBe('Done - added the image step.');
  });
});

describe('sanitizeReply noWorkflow', () => {
  it('drops a workflow question when there is no workflow', () => {
    expect(sanitizeReply('I updated your brand to Facebook only. Want me to update the workflow to only Facebook too?', { noWorkflow: true })).toBe('I updated your brand to Facebook only.');
    expect(sanitizeReply('Want me to update the workflow too?', { noWorkflow: false })).toBe('Want me to update the workflow too?');
  });
});
