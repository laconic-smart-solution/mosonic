import {
  interpretZernioPostForSync,
  mapWithConcurrencyLimit,
} from './upload-scheduled-sync.helpers';

describe('upload-scheduled-sync.helpers', () => {
  describe('interpretZernioPostForSync', () => {
    it('returns not_found when parsed is null', () => {
      expect(interpretZernioPostForSync(null)).toEqual({ kind: 'not_found' });
    });

    it('parses nested post.status strings', () => {
      expect(interpretZernioPostForSync({ post: { status: 'live' } })).toEqual({
        kind: 'mark_published',
        at: expect.any(Date),
      });
    });
  });

  describe('mapWithConcurrencyLimit', () => {
    it('runs all items with bounded concurrency', async () => {
      const out = await mapWithConcurrencyLimit(
        [1, 2, 3],
        2,
        async (n) => n * 2,
      );
      expect(out.sort((a, b) => a - b)).toEqual([2, 4, 6]);
    });
  });
});
