import { partitionPublishWorkByChannel } from './upload-provider-partition.util';

describe('partitionPublishWorkByChannel', () => {
  it('sends non-rednote channels to zernio and rednote alone', () => {
    const work = [
      { row: { channel: 'instagram' } },
      { row: { channel: 'rednote' } },
      { row: { channel: 'tiktok' } },
    ];
    const { zernioWork, rednoteWork } = partitionPublishWorkByChannel(work);
    expect(zernioWork.map((w) => w.row.channel)).toEqual([
      'instagram',
      'tiktok',
    ]);
    expect(rednoteWork.map((w) => w.row.channel)).toEqual(['rednote']);
  });

  it('is case-insensitive for rednote', () => {
    const { zernioWork, rednoteWork } = partitionPublishWorkByChannel([
      { channel: 'RedNote' },
      { channel: 'facebook' },
    ]);
    expect(zernioWork).toHaveLength(1);
    expect(rednoteWork).toHaveLength(1);
  });

  it('returns empty rednote when none present', () => {
    const { zernioWork, rednoteWork } = partitionPublishWorkByChannel([
      { channel: 'youtube' },
    ]);
    expect(zernioWork).toHaveLength(1);
    expect(rednoteWork).toHaveLength(0);
  });
});
