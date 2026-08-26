import {
  buildZernioProfileNameForUser,
  pickZernioProfileForUser,
  type ZernioProfileDto,
} from './zernio.client';

describe('buildZernioProfileNameForUser', () => {
  it('uses a deterministic mosonic prefix with user id', () => {
    expect(buildZernioProfileNameForUser('abc-123')).toBe('mosonic:abc-123');
  });
});

describe('pickZernioProfileForUser', () => {
  const profiles: ZernioProfileDto[] = [
    { _id: 'p1', name: 'Other Brand' },
    { _id: 'p2', name: 'user@example.com', isDefault: true },
    { _id: 'p3', name: 'Company' },
  ];

  it('prefers an exact name match', () => {
    expect(pickZernioProfileForUser(profiles, 'user@example.com')?._id).toBe(
      'p2',
    );
  });

  it('falls back to the default profile', () => {
    expect(pickZernioProfileForUser(profiles, 'unknown')?._id).toBe('p2');
  });

  it('falls back to the first profile when no default exists', () => {
    const withoutDefault = profiles.filter((profile) => !profile.isDefault);
    expect(pickZernioProfileForUser(withoutDefault, 'unknown')?._id).toBe('p1');
  });

  it('returns null when no profiles exist', () => {
    expect(pickZernioProfileForUser([], 'user@example.com')).toBeNull();
  });
});
