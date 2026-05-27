import { trimScriptToTargetDuration } from './presenter-script.util';

describe('trimScriptToTargetDuration', () => {
  it('returns short script unchanged', () => {
    expect(trimScriptToTargetDuration('Hello world', 8)).toBe('Hello world');
  });

  it('trims long script to approximate duration', () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const out = trimScriptToTargetDuration(words, 4);
    expect(out.endsWith('…')).toBe(true);
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(11);
  });
});
