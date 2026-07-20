import { RedNoteCookieCryptoService } from './rednote-cookie-crypto.service';
import { ConfigService } from '@nestjs/config';

describe('RedNoteCookieCryptoService', () => {
  const hexKey = 'a'.repeat(64);
  const config = {
    get: (key: string) =>
      key === 'REDNOTE_COOKIE_ENCRYPTION_KEY' ? hexKey : undefined,
  } as ConfigService;
  const crypto = new RedNoteCookieCryptoService(config);

  it('round-trips plaintext', () => {
    const plain = JSON.stringify([{ name: 'sid', value: 'abc', domain: '.xhs.com' }]);
    const enc = crypto.encrypt(plain);
    expect(enc).not.toContain('abc');
    expect(crypto.decrypt(enc)).toBe(plain);
  });

  it('newCookiesRef returns opaque id', () => {
    expect(crypto.newCookiesRef()).toMatch(/^rnck_[a-f0-9]+$/);
  });
});
