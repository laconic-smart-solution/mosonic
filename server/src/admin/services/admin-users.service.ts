import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '../../domain/users/user.types';
import type { ICostEntryRepository } from '../../repositories/interfaces/cost-entry.repository.interface';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { IPlanRepository } from '../../repositories/interfaces/plan.repository.interface';
import type { IRuleRepository } from '../../repositories/interfaces/rule.repository.interface';
import type { IUserPlanRepository } from '../../repositories/interfaces/user-plan.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';
import type { IWorkflowRepository } from '../../repositories/interfaces/workflow.repository.interface';
import {
  COST_ENTRY_REPOSITORY,
  PIPELINE_REPOSITORY,
  PLAN_REPOSITORY,
  RULE_REPOSITORY,
  USER_PLAN_REPOSITORY,
  USER_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '../../repositories/tokens';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function displayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? '';
}

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(RULE_REPOSITORY) private readonly rules: IRuleRepository,
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
  ) {}

  async listUsers(query: {
    page: number;
    limit: number;
    search?: string;
    status?: 'active' | 'suspended';
  }) {
    const { page, limit, search, status } = query;

    const statusFilter =
      status === 'suspended'
        ? UserStatus.DISABLED
        : status === 'active'
          ? UserStatus.ACTIVE
          : undefined;

    const { rows: users, total } = await this.users.listAdmin(
      { search, status: statusFilter },
      page,
      limit,
    );

    const mStart = monthStart();
    const userIds = users.map((u) => u.userId).filter(Boolean);

    const [costMap, pipelineCounts, userPlans] = await Promise.all([
      this.costEntries.sumForUsersInBillingPeriod(userIds, mStart),
      Promise.all(
        userIds.map(async (userId) => ({
          userId,
          count: await this.pipelines.count({
            userId,
            startedAt: { gte: mStart },
          }),
        })),
      ),
      this.userPlans.findActiveByUserIds(userIds),
    ]);

    const pipelineMap = Object.fromEntries(
      pipelineCounts.map((r) => [r.userId, r.count]),
    );
    const planMap = Object.fromEntries(userPlans.map((p) => [p.userId, p]));

    return {
      users: users.map((u) => ({
        _id: u.userId,
        userId: u.userId,
        email: u.email,
        displayName: displayName(u),
        createdAt: u.createdAt,
        lastActiveAt: u.lastLoginAt ?? null,
        isSuspended: u.status === UserStatus.DISABLED,
        role: u.role,
        costThisMonthUsd: costMap.get(u.userId) ?? 0,
        pipelinesThisMonth: pipelineMap[u.userId] ?? 0,
        creditsRemaining: planMap[u.userId]?.creditsRemaining ?? null,
        creditsPerMonth: planMap[u.userId]?.creditsPerMonth ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.users.findByUserId(userId);

    if (!user) throw new NotFoundException('User not found');

    const mStart = monthStart();

    const [
      ruleCount,
      workflowCount,
      pipelineCount,
      pipelineThisMonth,
      costThisMonth,
      costEntries,
      userPlan,
    ] = await Promise.all([
      this.rules.count({ userId }),
      this.workflows.count({ userId }),
      this.pipelines.count({ userId }),
      this.pipelines.count({ userId, startedAt: { gte: mStart } }),
      this.costEntries.sumMonthlyForUser(userId, mStart),
      this.costEntries.aggregateSummary({ userId, billingPeriod: mStart }),
      this.userPlans.findActiveByUserId(userId),
    ]);

    const costByProvider = costEntries.reduce<Record<string, number>>(
      (acc, row) => {
        const key = row.provider ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + row.costUsd;
        return acc;
      },
      {},
    );

    const planDoc = userPlan?.planId
      ? await this.plans.findByPlanId(userPlan.planId)
      : null;

    const safeUser = {
      userId: user.userId,
      email: user.email,
      displayName: displayName(user),
      role: user.role,
      isSuspended: user.status === UserStatus.DISABLED,
      createdAt: user.createdAt,
      lastActiveAt: user.lastLoginAt ?? null,
    };

    return {
      user: safeUser,
      credits: {
        remaining: userPlan?.creditsRemaining ?? null,
        perMonth: userPlan?.creditsPerMonth ?? null,
        used: userPlan?.creditsUsed ?? null,
        planName: planDoc?.name ?? null,
      },
      stats: {
        ruleCount,
        workflowCount,
        pipelineCount,
        pipelineThisMonth,
        costThisMonthUsd: costThisMonth,
        costByProvider,
      },
    };
  }

  async suspendUser(userId: string) {
    const user = await this.users.findByUserId(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot suspend an admin user');
    }
    await this.users.update(userId, { status: UserStatus.DISABLED });
    return { success: true, message: 'User suspended' };
  }

  async reactivateUser(userId: string) {
    const user = await this.users.findByUserId(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.users.update(userId, { status: UserStatus.ACTIVE });
    return { success: true, message: 'User reactivated' };
  }
}
