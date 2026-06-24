import {
  resolveDistributionChannelId,
  ruleChannelNamesToIds,
} from './distribution-channels.util';

describe('distribution-channels.util', () => {
  it('resolveDistributionChannelId maps Twitter / X label to twitter id', () => {
    expect(resolveDistributionChannelId('Twitter / X')).toBe('twitter');
    expect(resolveDistributionChannelId('twitter')).toBe('twitter');
  });

  it('ruleChannelNamesToIds accepts Twitter / X in rule channels', () => {
    const ids = ruleChannelNamesToIds([
      { channel: 'Instagram' },
      { channel: 'Twitter / X' },
    ]);
    expect(ids).toEqual(['instagram', 'twitter']);
  });
});
