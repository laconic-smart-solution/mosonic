import 'dotenv/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';

const USER_ID = '4859844b-7836-4f75-9077-a6f8a548cffe';
const REDNOTE_PUBLISH_QUEUE = 'rednote-publish';

const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

async function main() {
  const lockKeys = [
    `rednote:publish-lock:${USER_ID}`,
    `rednote:login-lock:${USER_ID}`,
  ];
  for (const key of lockKeys) {
    const deleted = await redis.del(key);
    console.log(`DEL ${key} => ${deleted}`);
  }

  const queue = new Queue(REDNOTE_PUBLISH_QUEUE, { connection: redis.duplicate() });
  const active = await queue.getJobs(['active', 'waiting', 'delayed']);
  console.log(`Found ${active.length} rednote-publish job(s)`);
  for (const job of active) {
    console.log(`  job id=${job.id} state data=${JSON.stringify(job.data).slice(0, 120)}`);
    try {
      await job.remove();
      console.log(`  removed job ${job.id}`);
    } catch (e) {
      console.log(`  remove failed ${job.id}: ${e.message}`);
      try {
        await job.discard();
        await job.moveToFailed(new Error('Killed by admin script'), '0', true);
      } catch {
        /* ignore */
      }
    }
  }
  await queue.obliterate({ force: true });
  console.log('Obliterated rednote-publish queue');

  const uploads = await prisma.upload.findMany({
    where: { userId: USER_ID },
    select: { uploadId: true, channels: true, status: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  let resetCount = 0;
  for (const upload of uploads) {
    const channels = Array.isArray(upload.channels) ? upload.channels : [];
    let changed = false;
    const next = channels.map((ch) => {
      if (
        typeof ch === 'object' &&
        ch &&
        String(ch.channel ?? '').toLowerCase() === 'rednote' &&
        String(ch.status ?? '').toLowerCase() === 'publishing'
      ) {
        changed = true;
        return {
          ...ch,
          status: 'failed',
          failureReason: 'Publish cancelled — job was stopped manually.',
        };
      }
      return ch;
    });
    if (changed) {
      await prisma.upload.update({
        where: { uploadId: upload.uploadId },
        data: { channels: next },
      });
      console.log(`Reset rednote channel on upload ${upload.uploadId}`);
      resetCount += 1;
    }
  }
  console.log(`Reset ${resetCount} upload(s)`);

  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
