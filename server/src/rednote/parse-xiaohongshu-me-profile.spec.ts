import { parseXiaohongshuMeProfile } from './parse-xiaohongshu-me-profile';

describe('parseXiaohongshuMeProfile', () => {
  it('returns nickname for a logged-in me payload', () => {
    expect(
      parseXiaohongshuMeProfile({
        data: {
          guest: false,
          nickname: '红薯蜀',
          red_id: '633500655',
        },
      }),
    ).toBe('红薯蜀');
  });

  it('falls back to red_id when nickname is missing', () => {
    expect(
      parseXiaohongshuMeProfile({
        data: { guest: false, red_id: '633500655' },
      }),
    ).toBe('633500655');
  });

  it('rejects guest payloads', () => {
    expect(
      parseXiaohongshuMeProfile({
        data: { guest: true, nickname: 'someone' },
      }),
    ).toBeNull();
  });

  it('ignores unrelated name fields used by other endpoints', () => {
    expect(
      parseXiaohongshuMeProfile({
        data: { guest: false, name: 'random feed title', red_id: '1' },
      }),
    ).toBe('1');
  });
});
