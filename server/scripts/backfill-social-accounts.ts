/**
 * Idempotent backfill of social_accounts from users.zernioConnectedAccounts.
 * Prefer the SQL in prisma/migrations/20250710100000_social_accounts for deploy;
 * this script is for re-runs / repair after the table already exists.
 *
 *   yarn migrate:social-accounts
 *   yarn migrate:social-accounts -- --dry-run
 */
import 'dotenv/config';
import { PrismaClient, SocialAccountStatus, SocialProvider } from '@prisma/client';
import { normalizeZernioConnectedAccountsJson } from '../src/users/social-account-json.util';

const dryRun = process.argv.slice(2).includes('--dry-run');
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { userId: true, zernioConnectedAccounts: true },
  });

  let upserted = 0;
  for (const user of users) {
    const accounts = normalizeZernioConnectedAccountsJson(
      user.zernioConnectedAccounts,
      user.userId,
    );
    for (const account of accounts) {
      if (dryRun) {
        console.log(
          `[dry-run] ${user.userId} ${account.channel} → ${account.accountId}`,
        );
        upserted += 1;
        continue;
      }
      await prisma.socialAccount.upsert({
        where: {
          userId_provider_channel: {
            userId: user.userId,
            provider: SocialProvider.ZERNIO,
            channel: account.channel,
          },
        },
        create: {
          userId: user.userId,
          provider: SocialProvider.ZERNIO,
          channel: account.channel,
          externalAccountId: account.accountId,
          status: SocialAccountStatus.ACTIVE,
          connectedAt: account.connectedAt,
          disconnectedAt: null,
          lastSyncedAt: new Date(),
        },
        update: {
          externalAccountId: account.accountId,
          status: SocialAccountStatus.ACTIVE,
          disconnectedAt: null,
          lastSyncedAt: new Date(),
        },
      });
      upserted += 1;
    }
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Done. Upserted ${upserted} social account row(s) from ${users.length} user(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
