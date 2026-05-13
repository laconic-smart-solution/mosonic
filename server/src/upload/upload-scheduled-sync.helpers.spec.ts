import { UploadChannelStatus } from './schemas/upload.schema';
import {
  accumulateScheduledZernioPostWork,
  interpretZernioPostForSync,
  mapWithConcurrencyLimit,
} from './upload-scheduled-sync.helpers';

describe('upload-scheduled-sync.helpers', () => {
  describe('accumulateScheduledZernioPostWork', () => {
    it('buckets scheduled channels by zernioPostId and dedupes uploadIds', () => {
      const map = new Map<string, Set<string>>();
      accumulateScheduledZernioPostWork(map, {
        uploadId: 'u1',
        channels: [
          {
            status: UploadChannelStatus.Scheduled,
            zernioPostId: 'p1',
          },
          {
            status: UploadChannelStatus.Pending,
            zernioPostId: 'p2',
          },
        ],
      });
      accumulateScheduledZernioPostWork(map, {
        uploadId: 'u2',
        channels: [
          {
            status: UploadChannelStatus.Scheduled,
            zernioPostId: 'p1',
          },
        ],
      });
      expect(Array.from(map.get('p1') ?? [])).toEqual(
        expect.arrayContaining(['u1', 'u2']),
      );
      expect(map.get('p1')?.size).toBe(2);
      expect(map.has('p2')).toBe(false);
    });

    it('ignores empty zernioPostId', () => {
      const map = new Map<string, Set<string>>();
      accumulateScheduledZernioPostWork(map, {
        uploadId: 'u1',
        channels: [
          { status: UploadChannelStatus.Scheduled, zernioPostId: '  ' },
          { status: UploadChannelStatus.Scheduled, zernioPostId: null },
        ],
      });
      expect(map.size).toBe(0);
    });
  });

  describe('interpretZernioPostForSync', () => {
    it('returns not_found for null', () => {
      expect(interpretZernioPostForSync(null).kind).toBe('not_found');
    });

    it('maps published statuses', () => {
      const d = interpretZernioPostForSync({ status: 'published' });
      expect(d.kind).toBe('mark_published');
    });

    it('maps scheduled to noop', () => {
      expect(interpretZernioPostForSync({ status: 'scheduled' }).kind).toBe(
        'noop_scheduled',
      );
    });

    it('maps cancelled to failed', () => {
      const d = interpretZernioPostForSync({ post: { status: 'cancelled' } });
      expect(d.kind).toBe('mark_failed');
      if (d.kind === 'mark_failed') {
        expect(d.message).toContain('cancelled');
      }
    });
  });

  describe('mapWithConcurrencyLimit', () => {
    it('invokes fn once per item and respects a low concurrency ceiling', async () => {
      let active = 0;
      let maxActive = 0;
      const calls: string[] = [];
      const items = ['a', 'b', 'c', 'd', 'e'];
      await mapWithConcurrencyLimit(items, 2, async (id) => {
        active++;
        maxActive = Math.max(maxActive, active);
        calls.push(id);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return id;
      });
      expect(calls.sort()).toEqual(items.sort());
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });
});
