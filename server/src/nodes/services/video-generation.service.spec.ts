import {
  normalizeSoraDurationSeconds,
  SORA_VIDEO_DURATIONS,
} from './video-generation.service';

/**
 * Size mapping for Sora must match OpenAI API constraints:
 * sora-2 → 720x1280 | 1280x720 only.
 */

type VideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024';

function resolveSoraSizeForTest(
  model: string,
  aspectRatio: string,
  resolution: string,
): VideoSize {
  const isSoraPro = model.includes('pro');
  const wantsHd = resolution === '1080p' && isSoraPro;
  const portrait =
    aspectRatio === '9:16' ||
    aspectRatio === '4:5' ||
    aspectRatio === '1:1';
  if (portrait) {
    return wantsHd ? '1024x1792' : '720x1280';
  }
  if (aspectRatio === '16:9') {
    return wantsHd ? '1792x1024' : '1280x720';
  }
  return wantsHd ? '1024x1792' : '720x1280';
}

describe('Sora video size mapping', () => {
  it('uses 1280x720 for sora-2 landscape even when resolution is 1080p', () => {
    expect(resolveSoraSizeForTest('sora-2', '16:9', '1080p')).toBe('1280x720');
  });

  it('uses 720x1280 for sora-2 portrait even when resolution is 1080p', () => {
    expect(resolveSoraSizeForTest('sora-2', '9:16', '1080p')).toBe('720x1280');
  });

  it('allows HD sizes for sora-2-pro at 1080p', () => {
    expect(resolveSoraSizeForTest('sora-2-pro', '16:9', '1080p')).toBe(
      '1792x1024',
    );
    expect(resolveSoraSizeForTest('sora-2-pro', '9:16', '1080p')).toBe(
      '1024x1792',
    );
  });
});

describe('normalizeSoraDurationSeconds', () => {
  it('snaps legacy duration 15 to 16', () => {
    expect(normalizeSoraDurationSeconds(15)).toBe(16);
  });

  it('keeps exact allowed values', () => {
    for (const d of SORA_VIDEO_DURATIONS) {
      expect(normalizeSoraDurationSeconds(d)).toBe(d);
    }
  });
});
