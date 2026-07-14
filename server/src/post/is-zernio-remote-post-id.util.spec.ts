import { isZernioRemotePostId } from './is-zernio-remote-post-id.util';

describe('isZernioRemotePostId', () => {
  it('accepts typical Zernio ids', () => {
    expect(isZernioRemotePostId('67f1a2b3c4d5e6f708192a3b')).toBe(true);
    expect(isZernioRemotePostId('post_abc123')).toBe(true);
  });

  it('rejects RedNote synthetic ids and URLs', () => {
    expect(
      isZernioRemotePostId('rednote:8894601f-7de7-4113-84aa-425e7384d66a'),
    ).toBe(false);
    expect(
      isZernioRemotePostId('https://www.xiaohongshu.com/explore/abc'),
    ).toBe(false);
    expect(isZernioRemotePostId('')).toBe(false);
    expect(isZernioRemotePostId(null)).toBe(false);
  });
});
