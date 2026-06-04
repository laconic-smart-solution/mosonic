/**
 * One-time migration: group legacy `uploads.channels[].zernioPostId` into `posts` docs,
 * then `$unset` embedded zernioPostId fields.
 *
 * Run from `server/`:
 *   yarn migrate:posts
 *   yarn migrate:posts -- --dry-run
 *
 * Requires MONGODB_URI. Run before deploying code that removes `zernioPostId` from the Upload schema.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const UPLOADS = 'uploads';
const POSTS = 'posts';

type RawChannel = {
  channel?: string;
  zernioPostId?: string | null;
  status?: string;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
};

function parseArgs(): { dryRun: boolean } {
  const dryRun = process.argv.includes('--dry-run');
  return { dryRun };
}

function inferPostStatus(
  rows: RawChannel[],
): 'published' | 'scheduled' | 'failed' | 'partial' | 'pending' {
  const statuses = new Set(
    rows.map((r) => String(r.status ?? '').toLowerCase()).filter(Boolean),
  );
  if (statuses.size === 0) return 'pending';
  if (statuses.size === 1) {
    const s = [...statuses][0]!;
    if (s === 'published') return 'published';
    if (s === 'scheduled') return 'scheduled';
    if (s === 'failed') return 'failed';
  }
  if (statuses.has('published') && statuses.has('scheduled')) return 'partial';
  if (
    statuses.has('published') &&
    (statuses.has('failed') || statuses.has('publishing'))
  ) {
    return 'partial';
  }
  return 'partial';
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database');

  const uploadCol = db.collection(UPLOADS);
  const postCol = db.collection(POSTS);

  let created = 0;
  let skippedDup = 0;
  let unsetUploads = 0;

  const cursor = uploadCol.find({
    channels: {
      $elemMatch: {
        zernioPostId: { $exists: true, $nin: [null, ''] },
      },
    },
  });

  for await (const doc of cursor) {
    const uploadId = String(doc.uploadId ?? '');
    if (!uploadId) continue;

    const userId =
      typeof doc.userId === 'string' && doc.userId.trim()
        ? doc.userId.trim()
        : 'legacy-migration';

    const channels = (doc.channels ?? []) as RawChannel[];
    const groups = new Map<string, RawChannel[]>();

    for (const ch of channels) {
      const pid = (ch.zernioPostId ?? '').trim();
      if (!pid) continue;
      let g = groups.get(pid);
      if (!g) {
        g = [];
        groups.set(pid, g);
      }
      g.push(ch);
    }

    const hadLegacyIds = groups.size > 0;

    for (const [zernioPostId, rows] of groups) {
      const exists = await postCol.findOne({
        uploadRef: uploadId,
        zernioPostId,
      });
      if (exists) {
        skippedDup += 1;
        continue;
      }

      const platformKeys = rows
        .map((r) => String(r.channel ?? '').trim().toLowerCase())
        .filter(Boolean);
      const uniquePlatforms = [...new Set(platformKeys)];

      const st = inferPostStatus(rows);
      let minScheduled: Date | null = null;
      let maxPublished: Date | null = null;
      for (const r of rows) {
        if (
          r.scheduledAt instanceof Date &&
          !Number.isNaN(r.scheduledAt.getTime())
        ) {
          if (
            !minScheduled ||
            r.scheduledAt.getTime() < minScheduled.getTime()
          ) {
            minScheduled = r.scheduledAt;
          }
        }
        if (
          r.publishedAt instanceof Date &&
          !Number.isNaN(r.publishedAt.getTime())
        ) {
          if (
            !maxPublished ||
            r.publishedAt.getTime() > maxPublished.getTime()
          ) {
            maxPublished = r.publishedAt;
          }
        }
      }

      const now = new Date();
      const postDoc = {
        postId: randomUUID(),
        userId,
        uploadRef: uploadId,
        ruleRef: String(doc.ruleRef ?? ''),
        contentRef: String(doc.contentRef ?? ''),
        zernioPostId,
        channels: uniquePlatforms,
        scheduledAt: st === 'scheduled' ? minScheduled : null,
        publishedAt: st === 'published' ? maxPublished ?? now : null,
        status: st,
        platformResults: [] as unknown[],
        retryCount: 0,
        failureReason: null,
        publishedNow: st === 'published',
        createdAt: now,
        updatedAt: now,
      };

      if (!dryRun) {
        await postCol.insertOne(postDoc);
      }
      created += 1;
    }

    if (hadLegacyIds && !dryRun) {
      await uploadCol.updateOne(
        { _id: doc._id },
        { $unset: { 'channels.$[].zernioPostId': '' } },
      );
      unsetUploads += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        dryRun,
        postsInserted: created,
        skippedExistingPost: skippedDup,
        uploadsUnset: dryRun ? 0 : unsetUploads,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
