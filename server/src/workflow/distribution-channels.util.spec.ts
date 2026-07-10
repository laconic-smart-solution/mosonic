import {
  isDeprecatedChannelId,
  resolveDistributionChannelId,
  ruleChannelNamesToIds,
} from './distribution-channels.util';

describe('distribution-channels.util', () => {
  it('resolveDistributionChannelId rejects deprecated Twitter / X labels', () => {
    expect(resolveDistributionChannelId('Twitter / X')).toBe('');
    expect(resolveDistributionChannelId('twitter')).toBe('');
    expect(resolveDistributionChannelId('x')).toBe('');
  });

  it('ruleChannelNamesToIds skips deprecated channels in rule channels', () => {
    const ids = ruleChannelNamesToIds([
      { channel: 'Instagram' },
      { channel: 'Twitter / X' },
    ]);
    expect(ids).toEqual(['instagram']);
  });

  it('isDeprecatedChannelId identifies retired platforms', () => {
    expect(isDeprecatedChannelId('twitter')).toBe(true);
    expect(isDeprecatedChannelId('x')).toBe(true);
    expect(isDeprecatedChannelId('instagram')).toBe(false);
  });
});
