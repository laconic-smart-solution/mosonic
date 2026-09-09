import {
  contentPageItemHasMedia,
  contentPageItemMatchesMediaFilters,
} from './content-page-media-filter.util';

describe('contentPageItemMatchesMediaFilters', () => {
  it('returns true when no media filters are active', () => {
    expect(contentPageItemMatchesMediaFilters({ outputs: {} }, [])).toBe(true);
  });

  it('matches image-only content when both image and video filters are selected (OR)', () => {
    const item = {
      outputs: { image: 'https://cdn.example.com/a.png' },
    };
    expect(contentPageItemMatchesMediaFilters(item, ['image', 'video'])).toBe(
      true,
    );
  });

  it('matches video-only content when both image and video filters are selected (OR)', () => {
    const item = {
      outputs: { video: 'https://cdn.example.com/a.mp4' },
    };
    expect(contentPageItemMatchesMediaFilters(item, ['image', 'video'])).toBe(
      true,
    );
  });

  it('does not match when content has neither selected media type', () => {
    const item = { outputs: { text: 'hello' } };
    expect(contentPageItemMatchesMediaFilters(item, ['image', 'video'])).toBe(
      false,
    );
  });

  it('detects lane output media fallbacks', () => {
    const item = {
      outputs: {},
      laneOutputs: {
        instagram: { image: 'https://cdn.example.com/lane.png' },
      },
    };
    expect(contentPageItemHasMedia(item, 'image')).toBe(true);
    expect(contentPageItemMatchesMediaFilters(item, ['image', 'video'])).toBe(
      true,
    );
  });
});
