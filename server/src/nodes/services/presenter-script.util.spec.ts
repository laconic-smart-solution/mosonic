import {
  calcWordBudget,
  countWords,
  needsRewrite,
  simpleTrim,
  trimScriptToTargetDuration,
} from './presenter-script.util';

describe('calcWordBudget', () => {
  it('returns floor(duration * 2.5) for in-range seconds', () => {
    expect(calcWordBudget(10)).toBe(25);
    expect(calcWordBudget(8)).toBe(20);
  });

  it('clamps duration to 4–120', () => {
    expect(calcWordBudget(1)).toBe(10);
    expect(calcWordBudget(200)).toBe(300);
  });
});

describe('needsRewrite', () => {
  it('returns false when at or below 120% of budget', () => {
    const atThreshold = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(needsRewrite(atThreshold, 10)).toBe(false);
    const under = Array.from({ length: 29 }, (_, i) => `w${i}`).join(' ');
    expect(needsRewrite(under, 10)).toBe(false);
  });

  it('returns true when just over 120% of budget', () => {
    const words = Array.from({ length: 31 }, (_, i) => `w${i}`).join(' ');
    expect(needsRewrite(words, 10)).toBe(true);
  });

  it('returns false when under budget', () => {
    expect(needsRewrite('one two three', 10)).toBe(false);
  });

  it('returns true when well over budget', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(' ');
    expect(needsRewrite(words, 10)).toBe(true);
  });
});

describe('simpleTrim', () => {
  it('returns short script unchanged', () => {
    expect(simpleTrim('Hello world', 8)).toBe('Hello world');
  });

  it('trims long script to budget with ellipsis', () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const out = simpleTrim(words, 4);
    expect(out.endsWith('…')).toBe(true);
    expect(countWords(out)).toBeLessThanOrEqual(calcWordBudget(4));
  });
});

describe('trimScriptToTargetDuration', () => {
  it('delegates to simpleTrim', () => {
    expect(trimScriptToTargetDuration('Hello world', 8)).toBe('Hello world');
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const out = trimScriptToTargetDuration(words, 4);
    expect(out).toBe(simpleTrim(words, 4));
  });
});
