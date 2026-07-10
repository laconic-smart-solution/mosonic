import {
  normalizeChannelKey,
  normalizeZernioConnectedAccountsJson,
} from './social-account-json.util';

describe('social-account-json.util', () => {
  it('normalizeChannelKey lowercases and trims', () => {
    expect(normalizeChannelKey(' Instagram ')).toBe('instagram');
  });

  it('normalizes array JSON', () => {
    const out = normalizeZernioConnectedAccountsJson(
      [
        {
          channel: 'Instagram',
          accountId: 'acc_1',
          connectedAt: '2026-01-02T00:00:00.000Z',
        },
        { channel: '', accountId: 'x' },
      ],
      'u1',
    );
    expect(out).toEqual([
      expect.objectContaining({
        userId: 'u1',
        channel: 'instagram',
        accountId: 'acc_1',
      }),
    ]);
  });

  it('normalizes legacy map JSON', () => {
    const out = normalizeZernioConnectedAccountsJson(
      { Facebook: 'acc_fb', linkedin: 'acc_li' },
      'u1',
    );
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'facebook', accountId: 'acc_fb' }),
        expect.objectContaining({ channel: 'linkedin', accountId: 'acc_li' }),
      ]),
    );
  });
});
