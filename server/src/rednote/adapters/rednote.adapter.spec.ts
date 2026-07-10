jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { SocialAccountStatus, SocialProvider } from '@prisma/client';
import type { SocialAccountRecord } from '../../domain/users/social-account.types';
import { RedNoteAdapter } from './rednote.adapter';
import { RedNoteSessionInvalidError } from '../errors/rednote.errors';

describe('RedNoteAdapter.getContext', () => {
  const users = {} as never;
  const publishQueue = { add: jest.fn() } as never;
  const browserService = {} as never;
  const cookieCrypto = {} as never;

  const adapter = new RedNoteAdapter(
    users,
    publishQueue,
    browserService,
    cookieCrypto,
  );

  const baseAccount: SocialAccountRecord = {
    id: 'sa1',
    userId: 'u1',
    provider: SocialProvider.REDNOTE,
    channel: 'rednote',
    externalAccountId: 'rednote:u1',
    displayName: null,
    username: null,
    avatarUrl: null,
    status: SocialAccountStatus.ACTIVE,
    connectedAt: new Date(),
    disconnectedAt: null,
    lastSyncedAt: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('throws when metadata session is missing', async () => {
    await expect(
      adapter.getContext({ ...baseAccount, metadata: null }),
    ).rejects.toBeInstanceOf(RedNoteSessionInvalidError);
  });

  it('throws when sessionStatus is needs_reauth', async () => {
    await expect(
      adapter.getContext({
        ...baseAccount,
        metadata: {
          sessionCookiesRef: 'rnck_abc',
          encryptedCookies: 'cipher',
          sessionStatus: 'needs_reauth',
          lastVerifiedAt: null,
          lastQrScanAt: null,
        },
      }),
    ).rejects.toBeInstanceOf(RedNoteSessionInvalidError);
  });

  it('returns context for active session metadata', async () => {
    const ctx = await adapter.getContext({
      ...baseAccount,
      metadata: {
        sessionCookiesRef: 'rnck_abc',
        encryptedCookies: 'cipher',
        sessionStatus: 'active',
        lastVerifiedAt: new Date().toISOString(),
        lastQrScanAt: null,
      },
    });
    expect(ctx).toEqual({
      provider: 'REDNOTE',
      accountRef: 'sa1',
      userId: 'u1',
      channel: 'rednote',
    });
  });
});
