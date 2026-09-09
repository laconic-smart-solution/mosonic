import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SocialProvider } from '@prisma/client';
import type { McpService } from '../mcp/mcp.service';
import type { RedNoteService } from '../rednote/rednote.service';
import type { IPlanRepository } from '../repositories/interfaces/plan.repository.interface';
import type { ISocialAccountRepository } from '../repositories/interfaces/social-account.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import {
  PLAN_REPOSITORY,
  SOCIAL_ACCOUNT_REPOSITORY,
  USER_PLAN_REPOSITORY,
} from '../repositories/tokens';

/**
 * Plan-tier channel entitlements — replaces the old one-time credit "unlock".
 * Access is always derived from the user's CURRENT active plan, never from
 * historical unlock records.
 *
 * McpService/RedNoteService are resolved lazily via ModuleRef (rather than
 * constructor-injected) so PlanModule doesn't need a module-level import of
 * McpModule/RedNoteModule — those two are already deeply cross-linked with
 * CreditModule/UploadModule/etc., and adding a direct `@Module` import edge
 * here cascades into a much larger circular-dependency chain across the app
 * (confirmed by a real bootstrap test). `ModuleRef#get(Token, {strict:
 * false})` looks the provider up in the whole app container at call time,
 * after the module graph has finished building, sidestepping that entirely.
 *
 * McpService/RedNoteService are imported as types only below (not values) —
 * a real top-level value import would make Jest eagerly require those files
 * (and their heavy deps: puppeteer, jose) whenever anything merely requires
 * this file, breaking unrelated test suites that never touch these channels.
 * The lazy `require()` calls at each call site load the module only when
 * actually needed (a dynamic `import()` would do the same for production,
 * but Jest's CommonJS runner can't execute a real dynamic import without
 * `--experimental-vm-modules`, so plain `require()` is used instead).
 */
@Injectable()
export class PlanChannelAccessService {
  private readonly logger = new Logger(PlanChannelAccessService.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(USER_PLAN_REPOSITORY) private readonly userPlans: IUserPlanRepository,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: ISocialAccountRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getAllowedChannelsForUser(userId: string): Promise<string[]> {
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    if (!userPlan) return [];
    const plan = await this.plans.findByPlanId(userPlan.planId);
    return plan?.allowedChannels ?? [];
  }

  async isChannelAllowed(userId: string, channel: string): Promise<boolean> {
    const normalized = channel.trim().toLowerCase();
    const allowed = await this.getAllowedChannelsForUser(userId);
    return allowed.includes(normalized);
  }

  /**
   * Called right after a user's active plan changes. Disconnects any
   * currently-active publish channel the new plan no longer includes —
   * immediately, no grace period. Never throws: a failed disconnect is
   * logged and skipped so it can't block the plan change itself.
   */
  async enforceChannelAccessForNewPlan(
    userId: string,
    newPlanId: string,
  ): Promise<void> {
    const plan = await this.plans.findByPlanId(newPlanId);
    const allowed = new Set(plan?.allowedChannels ?? []);

    const activeAccounts = await this.socialAccounts.findActiveByUserId(userId);
    for (const account of activeAccounts) {
      if (allowed.has(account.channel)) continue;

      try {
        if (account.provider === SocialProvider.REDNOTE) {
          const { RedNoteService } = require('../rednote/rednote.service') as
            typeof import('../rednote/rednote.service');
          const redNoteService = this.moduleRef.get(RedNoteService, {
            strict: false,
          });
          await redNoteService.disconnect(userId);
        } else {
          const { McpService } = require('../mcp/mcp.service') as
            typeof import('../mcp/mcp.service');
          const mcpService = this.moduleRef.get(McpService, { strict: false });
          await mcpService.disconnectAccount(userId, account.channel);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to disconnect channel "${account.channel}" for user ${userId} after plan change to ${newPlanId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
