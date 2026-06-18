/**
 * One-time migration from credit config v1 → v2.
 * Run: npx ts-node -r tsconfig-paths/register scripts/migrate-credit-config-v2.ts
 */
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/neutral-tex';
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const configCol = db.collection('credit_config');
  const fixedCol = db.collection('fixed_costs');
  const ledgerCol = db.collection('credit_ledger');

  const old = await configCol.findOne({ singletonKey: 'default' });
  if (old) {
    const infra = Number(old.infraCostUsd ?? 500);
    const maint = Number(old.maintCostUsd ?? 200);
    const marginTarget = Number(old.marginMultiplier ?? 3);
    const creditPriceUsd = 0.01;

    const fixedCount = await fixedCol.countDocuments();
    if (fixedCount === 0) {
      await fixedCol.insertMany([
        { name: 'Infrastructure', amountUsd: infra, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Maintenance', amountUsd: maint, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ]);
      console.log('Seeded fixed_costs from v1 infra/maint');
    }

    await configCol.updateOne(
      { singletonKey: 'default' },
      {
        $set: {
          creditPriceUsd,
          marginTarget,
          basicUsersPerMonth: 50,
          overheadFactor: 0,
          derivedMargin: 0,
        },
        $unset: {
          infraCostUsd: '',
          maintCostUsd: '',
          marginMultiplier: '',
          creditsIssuedPerMonth: '',
          creditValueUsd: '',
        },
      },
    );

    const history = (old.changeHistory ?? []) as Array<Record<string, unknown>>;
    if (history.some((entry) => entry.creditPriceUsd == null)) {
      await configCol.updateOne(
        { singletonKey: 'default' },
        {
          $set: {
            changeHistory: history.map((entry) => ({
              creditPriceUsd: Number(
                entry.creditPriceUsd ?? entry.creditValueUsd ?? creditPriceUsd,
              ),
              marginTarget: Number(entry.marginTarget ?? marginTarget),
              basicUsersPerMonth: Number(entry.basicUsersPerMonth ?? 50),
              overheadFactor: Number(entry.overheadFactor ?? 0),
              changedAt: entry.changedAt ? new Date(String(entry.changedAt)) : new Date(),
              changedBy: String(entry.changedBy ?? 'system'),
            })),
          },
        },
      );
      console.log('Normalized changeHistory to v2 shape');
    }

    console.log('Migrated credit_config to v2 fields');
  }

  const ledgerSample = await ledgerCol.findOne({});
  if (ledgerSample && ledgerSample.costUsd != null && ledgerSample.creditsCharged == null) {
    const cursor = ledgerCol.find({ creditsCharged: { $exists: false } });
    let count = 0;
    for await (const doc of cursor) {
      await ledgerCol.updateOne(
        { _id: doc._id },
        {
          $set: {
            model: doc.model ?? '',
            rawCostUsd: doc.costUsd ?? 0,
            overheadUsd: 0,
            marginAppliedUsd: 0,
            creditPriceUsdSnapshot: doc.creditValueUsd ?? 0.01,
            creditsCharged: Math.ceil(doc.creditsDeducted ?? 0),
          },
          $unset: { costUsd: '', creditValueUsd: '', creditsDeducted: '' },
        },
      );
      count += 1;
    }
    console.log(`Migrated ${count} credit_ledger rows`);
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
