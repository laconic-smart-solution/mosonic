import {
  DEFAULT_OAUTH_RETURN_TO,
  sanitizeOAuthReturnTo,
} from './oauth-return-to.util';

describe('sanitizeOAuthReturnTo', () => {
  it('allows /home and /settings/accounts', () => {
    expect(sanitizeOAuthReturnTo('/home')).toBe('/home');
    expect(sanitizeOAuthReturnTo('/settings/accounts')).toBe(
      '/settings/accounts',
    );
  });

  it('rejects absolute urls and unknown paths', () => {
    expect(sanitizeOAuthReturnTo('https://evil.com')).toBe(
      DEFAULT_OAUTH_RETURN_TO,
    );
    expect(sanitizeOAuthReturnTo('//evil.com')).toBe(DEFAULT_OAUTH_RETURN_TO);
    expect(sanitizeOAuthReturnTo('/admin')).toBe(DEFAULT_OAUTH_RETURN_TO);
    expect(sanitizeOAuthReturnTo(null)).toBe(DEFAULT_OAUTH_RETURN_TO);
  });
});
