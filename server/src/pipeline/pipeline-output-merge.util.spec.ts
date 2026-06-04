import { mergeParsedIntoPreviousOutputs } from './pipeline-output-merge.util';

describe('mergeParsedIntoPreviousOutputs', () => {
  it('stacks intelligenceBrief from multiple ancestors', () => {
    const acc = {};
    mergeParsedIntoPreviousOutputs(acc, {
      intelligenceBrief: 'First brief',
    });
    mergeParsedIntoPreviousOutputs(acc, {
      intelligenceBrief: 'Second brief',
    });
    expect(acc.intelligenceBrief).toBe('First brief\n\n---\n\nSecond brief');
  });

  it('merges non-intelligence fields with assign', () => {
    const acc = {};
    mergeParsedIntoPreviousOutputs(acc, { text: 'hello' });
    mergeParsedIntoPreviousOutputs(acc, { keywords: 'a, b' });
    expect(acc.text).toBe('hello');
    expect(acc.keywords).toBe('a, b');
  });
});
