import {
  pipelineJobIdPrefix,
  pipelineNodeDlqJobId,
  pipelineNodeJobId,
  pipelineNodeReplayJobId,
} from './node-job.payload';

describe('pipeline job ids', () => {
  it('uses a BullMQ-safe separator (no colons)', () => {
    const id = pipelineNodeJobId('pipe-1', 'node-2');
    expect(id).not.toContain(':');
    expect(id).toBe('pipe-1__node-2');
  });

  it('builds pipeline prefix for job scans', () => {
    expect(pipelineJobIdPrefix('pipe-1')).toBe('pipe-1__');
  });

  it('builds dlq and replay ids without colons', () => {
    expect(pipelineNodeDlqJobId('pipe-1__node-2')).toBe('pipe-1__node-2__dlq');
    expect(pipelineNodeReplayJobId('pipe-1', 'node-2')).toBe(
      'pipe-1__node-2__replay',
    );
  });
});
