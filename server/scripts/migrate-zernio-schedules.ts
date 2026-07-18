/**
 * Migrate local scheduled posts from Zernio timing → Mosonic scheduler service.
 *
 * For each posts row with status=scheduled and a future scheduledAt:
 *   1. Optionally refresh runAt from Zernio GET /posts/:id (scheduledFor)
 *   2. POST Mosonic scheduler event SOCIAL_PUBLISH (refId = postId)
 *   3. Clear Zernio scheduledFor so only Mosonic fires
 *
 *   yarn migrate:zernio-schedules -- --dry-run
 *   yarn migrate:zernio-schedules
 *   yarn migrate:zernio-schedules -- --skip-zernio-clear
 *   yarn migrate:zernio-schedules -- --limit=10
 */
import 'dotenv/config';
import axios, { isAxiosError } from 'axios';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipZernioClear = args.includes('--skip-zernio-clear');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

const prisma = new PrismaClient();

type ZernioPostShape = {
  scheduledFor?: string | null;
  status?: string;
  _id?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function extractScheduledFor(remote: unknown): string | null {
  if (!remote || typeof remote !== 'object') return null;
  const obj = remote as Record<string, unknown>;
  const post =
    obj.post && typeof obj.post === 'object'
      ? (obj.post as Record<string, unknown>)
      : obj;
  const raw = post.scheduledFor;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

const ZERNIO_REST_BASE = 'https://zernio.com/api/v1';

async function getZernioPost(
  zernioPostId: string,
  apiKey: string,
): Promise<ZernioPostShape | null> {
  try {
    const { data } = await axios.get<Record<string, unknown>>(
      `${ZERNIO_REST_BASE}/posts/${encodeURIComponent(zernioPostId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30_000,
      },
    );
    const post = (data?.post ?? data) as ZernioPostShape | null;
    return post ?? null;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

async function clearZernioSchedule(
  zernioPostId: string,
  apiKey: string,
): Promise<void> {
  await axios.put(
    `${ZERNIO_REST_BASE}/posts/${encodeURIComponent(zernioPostId)}`,
    { scheduledFor: null },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
}

async function createSchedulerJob(params: {
  baseUrl: string;
  apiKey: string;
  refId: string;
  runAt: string;
  timezone: string;
}): Promise<{ id: string }> {
  const { data } = await axios.post(
    `${params.baseUrl}/api/v1/events`,
    {
      eventType: 'SOCIAL_PUBLISH',
      refId: params.refId,
      runAt: params.runAt,
      timezone: params.timezone,
    },
    {
      headers: {
        'X-Scheduler-API-Key': params.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  return data?.data ?? data;
}

async function main(): Promise<void> {
  const schedulerUrl = requireEnv('SCHEDULER_SERVICE_URL').replace(/\/+$/, '');
  const schedulerKey = requireEnv('SCHEDULER_API_KEY');
  const timezone =
    process.env.SCHEDULER_DEFAULT_TIMEZONE?.trim() || 'UTC';
  const zernioKey = process.env.ZERNIO_API_KEY?.trim() || '';

  const now = new Date();
  const posts = await prisma.post.findMany({
    where: {
      status: 'scheduled',
      zernioPostId: { not: null },
      scheduledAt: { gt: now },
    },
    orderBy: { scheduledAt: 'asc' },
    ...(limit && Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
  });

  console.log(
    `Found ${posts.length} future scheduled post(s)${dryRun ? ' [dry-run]' : ''}`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const post of posts) {
    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId || !post.scheduledAt) {
      skipped += 1;
      continue;
    }

    let runAt = post.scheduledAt.toISOString();
    try {
      if (zernioKey) {
        try {
          const remote = await getZernioPost(zernioPostId, zernioKey);
          const remoteAt = extractScheduledFor(remote);
          if (remoteAt) {
            const remoteDate = new Date(remoteAt);
            if (!Number.isNaN(remoteDate.getTime()) && remoteDate > now) {
              runAt = remoteDate.toISOString();
            } else if (
              !Number.isNaN(remoteDate.getTime()) &&
              remoteDate <= now
            ) {
              console.warn(
                `skip ${post.postId}: Zernio scheduledFor already past (${remoteAt})`,
              );
              skipped += 1;
              continue;
            }
          }
        } catch (lookupErr) {
          const detail = isAxiosError(lookupErr)
            ? JSON.stringify(lookupErr.response?.data ?? lookupErr.message)
            : lookupErr instanceof Error
              ? lookupErr.message
              : String(lookupErr);
          console.warn(
            `  Zernio lookup failed for ${zernioPostId}, using local scheduledAt: ${detail}`,
          );
        }
      }

      console.log(
        `${dryRun ? '[dry-run] ' : ''}migrate postId=${post.postId} zernio=${zernioPostId} runAt=${runAt}`,
      );

      if (!dryRun) {
        const job = await createSchedulerJob({
          baseUrl: schedulerUrl,
          apiKey: schedulerKey,
          refId: post.postId,
          runAt,
          timezone,
        });
        console.log(`  → scheduler job ${job.id ?? '(ok)'}`);

        if (!skipZernioClear && zernioKey) {
          try {
            await clearZernioSchedule(zernioPostId, zernioKey);
            console.log('  → cleared Zernio scheduledFor');
          } catch (clearErr) {
            const detail = isAxiosError(clearErr)
              ? JSON.stringify(clearErr.response?.data ?? clearErr.message)
              : clearErr instanceof Error
                ? clearErr.message
                : String(clearErr);
            console.warn(
              `  → Zernio clear failed (job still created): ${detail}`,
            );
          }
        } else if (skipZernioClear) {
          console.log('  → skipped Zernio clear (--skip-zernio-clear)');
        } else if (!zernioKey) {
          console.warn(
            '  → skipped Zernio clear (ZERNIO_API_KEY missing); dual-schedule risk',
          );
        }
      }
      ok += 1;
    } catch (err) {
      failed += 1;
      const detail = isAxiosError(err)
        ? JSON.stringify(err.response?.data ?? err.message)
        : err instanceof Error
          ? err.message
          : String(err);
      console.error(`FAIL postId=${post.postId}: ${detail}`);
    }
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Done. ok=${ok} skipped=${skipped} failed=${failed}`,
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
