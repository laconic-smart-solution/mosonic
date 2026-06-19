/**
 * Repair shared Zernio profile assignments: earliest user keeps the profile;
 * all other users in each duplicate group get a new dedicated profile and
 * cleared connected-account JSON (unlock credits are unchanged).
 *
 * Run from `server/`:
 *   yarn migrate:repair-zernio-profiles
 *   yarn migrate:repair-zernio-profiles -- --dry-run
 *
 * Requires DATABASE_URL and ZERNIO_API_KEY in `.env` or the environment.
 * Apply the unique zernioProfileId migration after this script succeeds.
 */
import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { buildZernioProfileNameForUser } from '../src/mcp/zernio/zernio.client';

type RepairOptions = {
  dryRun: boolean;
};

function parseArgs(): RepairOptions {
  return { dryRun: process.argv.slice(2).includes('--dry-run') };
}

async function createZernioProfile(name: string): Promise<string> {
  const key = process.env.ZERNIO_API_KEY?.trim();
  if (!key) {
    throw new Error('ZERNIO_API_KEY is not set');
  }
  const res = await axios.post<{ profile: { _id: string } }>(
    'https://zernio.com/api/v1/profiles',
    { name },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const id = res.data.profile?._id?.trim();
  if (!id) {
    throw new Error(`Zernio createProfile returned no id for name ${name}`);
  }
  return id;
}

async function createDedicatedProfile(userId: string): Promise<string> {
  const baseName = buildZernioProfileNameForUser(userId);
  try {
    return await createZernioProfile(baseName);
  } catch {
    return await createZernioProfile(`${baseName}:${Date.now()}`);
  }
}

async function listDuplicateGroups(prisma: PrismaClient) {
  const rows = await prisma.user.findMany({
    where: { zernioProfileId: { not: null } },
    select: {
      userId: true,
      zernioProfileId: true,
      createdAt: true,
      email: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<
    string,
    Array<{ userId: string; createdAt: Date; email: string | null }>
  >();

  for (const row of rows) {
    const profileId = row.zernioProfileId?.trim();
    if (!profileId) continue;
    const bucket = groups.get(profileId) ?? [];
    bucket.push({
      userId: row.userId,
      createdAt: row.createdAt,
      email: row.email,
    });
    groups.set(profileId, bucket);
  }

  return Array.from(groups.entries())
    .filter(([, users]) => users.length > 1)
    .map(([profileId, users]) => ({ profileId, users }));
}

async function main() {
  const { dryRun } = parseArgs();
  const prisma = new PrismaClient();

  try {
    const groups = await listDuplicateGroups(prisma);
    if (groups.length === 0) {
      console.log('No duplicate zernioProfileId groups found.');
      return;
    }

    console.log(
      `Found ${groups.length} shared profile group(s)${dryRun ? ' (dry-run)' : ''}.`,
    );

    let reassigned = 0;
    let kept = 0;

    for (const group of groups) {
      const [owner, ...others] = group.users;
      console.log(
        `\nProfile ${group.profileId}: owner ${owner.userId} (${owner.email ?? 'no email'}), ${others.length} non-owner(s)`,
      );
      kept += 1;

      for (const user of others) {
        if (dryRun) {
          console.log(
            `[dry-run] would assign new profile + clear accounts for ${user.userId} (${user.email ?? 'no email'})`,
          );
          reassigned += 1;
          continue;
        }

        const newProfileId = await createDedicatedProfile(user.userId);
        await prisma.user.update({
          where: { userId: user.userId },
          data: {
            zernioProfileId: newProfileId,
            zernioConnectedAccounts: [],
          },
        });
        console.log(
          `Reassigned ${user.userId} → profile ${newProfileId}; cleared connected accounts`,
        );
        reassigned += 1;
      }
    }

    console.log(
      `\nDone. Kept ${kept} canonical owner profile(s); reassigned ${reassigned} user(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
