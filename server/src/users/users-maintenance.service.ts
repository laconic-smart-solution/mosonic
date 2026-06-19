import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { USER_REPOSITORY } from '../repositories/tokens';

@Injectable()
export class UsersMaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(UsersMaintenanceService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dedupeUsersByEmail();
    } catch (err) {
      this.logger.warn(
        `User dedupe skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * One-time, idempotent cleanup: merge users that share an email, keeping the
   * oldest as canonical and reassigning all `userId`-scoped data to it.
   */
  async dedupeUsersByEmail(): Promise<void> {
    const users = await this.users.listForEmailDedupe();

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

      const [canonicalUserId, ...duplicateUserIds] = list;
      for (const dupUserId of duplicateUserIds) {
        await this.reassignUserData(dupUserId, canonicalUserId);
        await this.users.deleteByUserId(dupUserId);
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
    await this.prisma.$transaction(async (tx) => {
      await tx.userPlan.deleteMany({ where: { userId: fromUserId } });
      await tx.budgetSettings.deleteMany({ where: { userId: fromUserId } });

      await tx.creditLedger.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.creditTopup.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.creditTopupPurchase.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.workflow.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.workflowNode.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.rule.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.pipeline.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.content.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.upload.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.post.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.postAnalytics.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.costEntry.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.campaignSchedule.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.campaignAutonomyPolicy.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.integrationApiKey.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.webhookSubscription.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
    });
  }
}
