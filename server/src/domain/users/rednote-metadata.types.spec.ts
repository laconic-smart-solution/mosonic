import {
  parseRedNoteMetadata,
  rednoteExternalAccountId,
} from './rednote-metadata.types';

describe('rednote-metadata.types', () => {
  it('builds synthetic external account id', () => {
    expect(rednoteExternalAccountId('u1')).toBe('rednote:u1');
  });

  it('parses valid metadata', () => {
    const meta = parseRedNoteMetadata({
      sessionCookiesRef: 'rnck_1',
      encryptedCookies: 'abc',
      sessionStatus: 'active',
      lastVerifiedAt: '2026-01-01T00:00:00.000Z',
      lastQrScanAt: null,
    });
    expect(meta?.sessionStatus).toBe('active');
  });

  it('rejects incomplete metadata', () => {
    expect(parseRedNoteMetadata({ sessionStatus: 'active' })).toBeNull();
  });
});
