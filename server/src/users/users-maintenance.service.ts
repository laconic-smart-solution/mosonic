import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { User, type UserDocument } from './schemas/user.schema';

/**
 * Models keyed by `userId` whose duplicates must be removed (not reassigned)
 * because of a unique / partial-unique `userId` index. The canonical user keeps
 * its own document for these.
 */
const DELETE_NOT_REASSIGN_MODELS = new Set(['UserPlan', 'BudgetSettings']);

@Injectable()
export class UsersMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(UsersMaintenanceService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.fixZernioProfileIdIndex();
    } catch (err) {
      this.logger.warn(
        `zernioProfileId index fix skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await this.dedupeUsersByEmail();
    } catch (err) {
      this.logger.warn(
        `User dedupe skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Legacy `zernioProfileId_1` was a non-sparse unique index. With
   * `default: null`, only one user could exist without a profile id.
   * Unset nulls and replace with a sparse unique index.
   */
  private async fixZernioProfileIdIndex(): Promise<void> {
    const collection = this.userModel.collection;

    const unsetResult = await collection.updateMany(
      { $or: [{ zernioProfileId: null }, { zernioProfileId: '' }] },
      { $unset: { zernioProfileId: '' } },
    );
    if (unsetResult.modifiedCount > 0) {
      this.logger.log(
        `Cleared null/empty zernioProfileId on ${unsetResult.modifiedCount} user(s)`,
      );
    }

    try {
      await collection.dropIndex('zernioProfileId_1');
      this.logger.log('Dropped legacy zernioProfileId_1 index');
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 27) {
        throw err;
      }
    }

    await this.userModel.syncIndexes();
    this.logger.log('Synced user indexes (sparse unique zernioProfileId)');
  }

  /**
   * One-time, idempotent cleanup: merge users that share an email, keeping the
   * oldest as canonical and reassigning all `userId`-scoped data to it.
   */
  async dedupeUsersByEmail(): Promise<void> {
    const users = await this.userModel
      .find({ email: { $nin: [null, ''] } })
      .select({ userId: 1, email: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec();

    const groups = new Map<string, string[]>();
    for (const u of users) {
      const email = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
      if (!email) continue;
      const list = groups.get(email) ?? [];
      list.push(u.userId);
      groups.set(email, list);
    }

    let mergedAccounts = 0;
    let removedUsers = 0;

    for (const [email, list] of groups) {
      if (list.length < 2) continue;

      // Sorted oldest-first already; canonical is the first.
      const [canonicalUserId, ...duplicateUserIds] = list;
      for (const dupUserId of duplicateUserIds) {
        await this.reassignUserData(dupUserId, canonicalUserId);
        await this.userModel.deleteOne({ userId: dupUserId }).exec();
        removedUsers += 1;
      }
      mergedAccounts += 1;
      this.logger.log(
        `Merged ${duplicateUserIds.length} duplicate user(s) for ${email} into ${canonicalUserId}`,
      );
    }

    if (removedUsers > 0) {
      this.logger.log(
        `User dedupe complete: ${removedUsers} duplicate user(s) merged across ${mergedAccounts} account(s).`,
      );
    }
  }

  /** Move every `userId`-scoped document from a duplicate to the canonical user. */
  private async reassignUserData(
    fromUserId: string,
    toUserId: string,
  ): Promise<void> {
    for (const modelName of this.connection.modelNames()) {
      if (modelName === User.name) continue;
      const model = this.connection.models[modelName];
      if (!model?.schema?.path('userId')) continue;

      if (DELETE_NOT_REASSIGN_MODELS.has(modelName)) {
        await model.deleteMany({ userId: fromUserId }).exec();
        continue;
      }

      await model
        .updateMany({ userId: fromUserId }, { $set: { userId: toUserId } })
        .exec();
    }
  }
}
