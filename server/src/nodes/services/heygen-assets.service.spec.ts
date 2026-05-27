import {
  heygenCallbackId,
  parseHeygenCallbackId,
} from './heygen-assets.service';

describe('HeyGen callback id helpers', () => {
  it('formats pipeline and node with __ separator', () => {
    expect(heygenCallbackId('pipe-1', 'node-2')).toBe('pipe-1__node-2');
  });

  it('parses valid callback ids', () => {
    expect(parseHeygenCallbackId('pipe-1__node-2')).toEqual({
      pipelineId: 'pipe-1',
      nodeId: 'node-2',
    });
  });

  it('rejects invalid callback ids', () => {
    expect(parseHeygenCallbackId('')).toBeNull();
    expect(parseHeygenCallbackId('no-separator')).toBeNull();
    expect(parseHeygenCallbackId('__only-node')).toBeNull();
  });
});
