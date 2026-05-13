/**
 * One-time backfill: insert `keyword_planner` at order 1 for workflows that only had `text_generation`.
 *
 * Run from `server/` after build or with ts-node:
 *   yarn ts-node -r tsconfig-paths/register scripts/backfill-keyword-planner.ts
 *
 * Requires MONGODB_URI in the environment.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const WORKFLOW_NODES = 'workflow_nodes';
const WORKFLOWS = 'workflows';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database connection');
  }

  const nodesCol = db.collection(WORKFLOW_NODES);
  const wfCol = db.collection(WORKFLOWS);

  const workflowRefs = await nodesCol.distinct('workflowRef');
  let updated = 0;

  for (const workflowRef of workflowRefs) {
    if (typeof workflowRef !== 'string' || !workflowRef) continue;

    const nodes = await nodesCol
      .find({ workflowRef })
      .sort({ order: 1 })
      .toArray();

    if (nodes.length === 0) continue;
    if (nodes.some((n) => n.type === 'keyword_planner')) continue;

    const userId =
      typeof nodes[0]?.userId === 'string' ? nodes[0].userId : undefined;
    const now = new Date();
    const nodeId = randomUUID();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await nodesCol.updateMany(
          { workflowRef },
          { $inc: { order: 1 } },
          { session },
        );
        await nodesCol.insertOne(
          {
            nodeId,
            workflowRef,
            userId,
            type: 'keyword_planner',
            order: 1,
            isLocked: false,
            userPrompt: '',
            config: {},
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
        await wfCol.updateOne(
          { workflowId: workflowRef },
          { $push: { nodes: { $each: [nodeId], $position: 0 } } },
          { session },
        );
      });
      updated += 1;
    } finally {
      await session.endSession();
    }
  }

  // eslint-disable-next-line no-console -- migration script
  console.log(`Backfill complete. Updated ${updated} workflow(s).`);
  await mongoose.disconnect();
}

void main().catch((err) => {
  // eslint-disable-next-line no-console -- migration script
  console.error(err);
  process.exit(1);
});
