import {
  calcWordBudget,
  computePresenterVoiceSpeed,
  countWords,
  DEFAULT_HEYGEN_WORDS_PER_SECOND,
  EXPAND_THRESHOLD,
  needsExpand,
  needsRewrite,
  resolveHeygenWordsPerSecond,
  sanitizeSpokenScript,
  simpleTrim,
  trimScriptToTargetDuration,
} from './presenter-script.util';

describe('resolveHeygenWordsPerSecond', () => {
  it('defaults to 3.1 when unset or invalid', () => {
    expect(resolveHeygenWordsPerSecond()).toBe(3.1);
    expect(resolveHeygenWordsPerSecond('')).toBe(3.1);
    expect(resolveHeygenWordsPerSecond('bad')).toBe(3.1);
  });

  it('parses valid env override', () => {
    expect(resolveHeygenWordsPerSecond('2.8')).toBe(2.8);
    expect(resolveHeygenWordsPerSecond(3.5)).toBe(3.5);
  });
});

describe('calcWordBudget', () => {
  it('returns floor(duration * 3.1) for in-range seconds', () => {
    expect(calcWordBudget(10)).toBe(31);
    expect(calcWordBudget(8)).toBe(24);
  });

  it('clamps duration to 4–120', () => {
    expect(calcWordBudget(1)).toBe(12);
    expect(calcWordBudget(200)).toBe(372);
  });

  it('accepts custom wps', () => {
    expect(calcWordBudget(10, 2.5)).toBe(25);
  });
});

describe('needsExpand', () => {
  it('returns true when below 85% of budget', () => {
    const budget = calcWordBudget(10);
    const threshold = Math.floor(budget * EXPAND_THRESHOLD);
    const short = Array.from({ length: threshold - 1 }, (_, i) => `w${i}`).join(
      ' ',
    );
    expect(needsExpand(short, 10)).toBe(true);
  });

  it('returns false when at or above 85% of budget', () => {
    const budget = calcWordBudget(10);
    const atThreshold = Array.from(
      { length: Math.ceil(budget * EXPAND_THRESHOLD) },
      (_, i) => `w${i}`,
    ).join(' ');
    expect(needsExpand(atThreshold, 10)).toBe(false);
  });
});

describe('computePresenterVoiceSpeed', () => {
  it('returns 1 when word count matches target at default wps', () => {
    expect(computePresenterVoiceSpeed(31, 10)).toBeCloseTo(1, 5);
  });

  it('slows speech when script is shorter than target', () => {
    const speed = computePresenterVoiceSpeed(25, 10);
    expect(speed).toBeLessThan(1);
    expect(speed).toBeGreaterThanOrEqual(0.5);
  });

  it('clamps to HeyGen allowed range', () => {
    expect(computePresenterVoiceSpeed(5, 10)).toBe(0.5);
    expect(computePresenterVoiceSpeed(100, 10)).toBe(1.5);
  });
});

describe('needsRewrite', () => {
  it('returns false when at or below 120% of budget', () => {
    const budget = calcWordBudget(10);
    const atThreshold = Array.from(
      { length: Math.floor(budget * 1.2) },
      (_, i) => `w${i}`,
    ).join(' ');
    expect(needsRewrite(atThreshold, 10)).toBe(false);
    const under = Array.from(
      { length: Math.floor(budget * 1.2) - 1 },
      (_, i) => `w${i}`,
    ).join(' ');
    expect(needsRewrite(under, 10)).toBe(false);
  });

  it('returns true when just over 120% of budget', () => {
    const budget = calcWordBudget(10);
    const words = Array.from(
      { length: Math.floor(budget * 1.2) + 1 },
      (_, i) => `w${i}`,
    ).join(' ');
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

describe('sanitizeSpokenScript', () => {
  it('removes hashtags, mentions, urls, and emoji', () => {
    const input =
      'Hey everyone! Check this out 🔥 #Marketing #AI @brand https://example.com/x';
    expect(sanitizeSpokenScript(input)).toBe('Hey everyone! Check this out');
  });

  it('strips bullet markers and collapses whitespace', () => {
    const input = '- First point\n• Second point';
    expect(sanitizeSpokenScript(input)).toBe('First point Second point');
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

describe('DEFAULT_HEYGEN_WORDS_PER_SECOND', () => {
  it('is calibrated above legacy 2.5 rate', () => {
    expect(DEFAULT_HEYGEN_WORDS_PER_SECOND).toBeGreaterThan(2.5);
  });
});
