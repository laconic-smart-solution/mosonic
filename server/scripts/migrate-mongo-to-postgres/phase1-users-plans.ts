/**
 * One-time migration: copy users, plans, and user_plans from MongoDB to PostgreSQL.
 *
 * Run from `server/`:
 *   yarn migrate:mongo-to-postgres:phase1
 *   yarn migrate:mongo-to-postgres:phase1 -- --dry-run
 *
 * Requires MONGODB_URI (source) and DATABASE_URL (target).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { PrismaClient, UserPlanStatus, UserRole, UserStatus } from '@prisma/client';

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const mongoUri = process.env.MONGODB_URI?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!mongoUri) throw new Error('MONGODB_URI is not set');
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;
  const prisma = new PrismaClient();

  try {
    const usersCol = db.collection('users');
    const plansCol = db.collection('plans');
    const userPlansCol = db.collection('user_plans');

    const plans = await plansCol.find({}).toArray();
    console.log(`Found ${plans.length} plan(s) in Mongo`);
    for (const doc of plans) {
      const planId = String(doc.planId ?? '');
      if (!planId) continue;
      const data = {
        planId,
        name: String(doc.name ?? 'Plan'),
        priceThb: Number(doc.priceThb ?? 0),
        priceUsd: Number(doc.priceUsd ?? 0),
        creditsPerMonth: doc.creditsPerMonth != null ? Number(doc.creditsPerMonth) : null,
        creditsOverride: doc.creditsOverride != null ? Number(doc.creditsOverride) : null,
        isActive: doc.isActive !== false,
        description: doc.description != null ? String(doc.description) : null,
        features: Array.isArray(doc.features) ? doc.features.map(String) : [],
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      };
      if (dryRun) {
        console.log(`[dry-run] upsert plan ${planId}`);
        continue;
      }
      await prisma.plan.upsert({
        where: { planId },
        create: data,
        update: data,
      });
    }

    const users = await usersCol.find({}).toArray();
    console.log(`Found ${users.length} user(s) in Mongo`);
    for (const doc of users) {
      const userId = String(doc.userId ?? '');
      const authServerUserId = String(doc.authServerUserId ?? '');
      if (!userId || !authServerUserId) continue;
      const data = {
        userId,
        authServerUserId,
        email: doc.email != null ? String(doc.email) : null,
        username: doc.username != null ? String(doc.username) : null,
        firstName: doc.firstName != null ? String(doc.firstName) : null,
        lastName: doc.lastName != null ? String(doc.lastName) : null,
        avatarUrl: doc.avatarUrl != null ? String(doc.avatarUrl) : null,
        role: (doc.role === 'ADMIN' ? UserRole.ADMIN : UserRole.CUSTOMER),
        status: (doc.status === 'DISABLED' ? UserStatus.DISABLED : UserStatus.ACTIVE),
        lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt) : null,
        zernioProfileId: doc.zernioProfileId != null ? String(doc.zernioProfileId) : null,
        zernioConnectedAccounts: doc.zernioConnectedAccounts ?? [],
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      };
      if (dryRun) {
        console.log(`[dry-run] upsert user ${userId}`);
        continue;
      }
      await prisma.user.upsert({
        where: { userId },
        create: data,
        update: data,
      });
    }

    const userPlans = await userPlansCol.find({}).toArray();
    console.log(`Found ${userPlans.length} user_plan(s) in Mongo`);
    for (const doc of userPlans) {
      const userId = String(doc.userId ?? '');
      const planId = String(doc.planId ?? '');
      if (!userId || !planId) continue;
      const status =
        doc.status === 'suspended' ? UserPlanStatus.suspended : UserPlanStatus.active;
      const data = {
        userId,
        planId,
        creditsPerMonth: Number(doc.creditsPerMonth ?? 0),
        billingPeriod: doc.billingPeriod ? new Date(doc.billingPeriod) : new Date(),
        creditsUsed: Number(doc.creditsUsed ?? 0),
        creditsRemaining: Number(doc.creditsRemaining ?? 0),
        status,
        lowBalanceNotifiedAt: doc.lowBalanceNotifiedAt
          ? new Date(doc.lowBalanceNotifiedAt)
          : null,
        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      };
      if (dryRun) {
        console.log(`[dry-run] upsert user_plan ${userId}/${planId}`);
        continue;
      }
      const existing = await prisma.userPlan.findFirst({
        where: { userId, planId, status },
      });
      if (existing) {
        await prisma.userPlan.update({ where: { id: existing.id }, data });
      } else {
        await prisma.userPlan.create({ data });
      }
    }

    console.log('Phase 1 migration complete');
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
