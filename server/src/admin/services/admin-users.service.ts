import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostEntry, type CostEntryDocument } from '../../cost/schemas/cost-entry.schema';
import { Pipeline, type PipelineDocument } from '../../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../../rule/schemas/rule.schema';
import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from '../../users/schemas/user.schema';
import { Workflow, type WorkflowDocument } from '../../workflow/schemas/workflow.schema';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function displayName(u: {
  firstName?: string;
  lastName?: string;
  username?: string;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? '';
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(Rule.name) private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(CostEntry.name)
    private readonly costModel: Model<CostEntryDocument>,
  ) {}

  async listUsers(query: {
    page: number;
    limit: number;
    search?: string;
    status?: 'active' | 'suspended';
  }) {
    const { page, limit, search, status } = query;

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }
    if (status === 'suspended') filter.status = UserStatus.DISABLED;
    if (status === 'active') filter.status = UserStatus.ACTIVE;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter, {
          userId: 1,
          email: 1,
          username: 1,
          firstName: 1,
          lastName: 1,
          createdAt: 1,
          lastLoginAt: 1,
          status: 1,
          role: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    const mStart = monthStart();
    const userIds = users.map((u) => u.userId).filter(Boolean) as string[];

    const [costAgg, pipelineAgg] = await Promise.all([
      this.costModel.aggregate([
        { $match: { userId: { $in: userIds }, billingPeriod: mStart } },
        { $group: { _id: '$userId', total: { $sum: '$costUsd' } } },
      ]),
      this.pipelineModel.aggregate([
        {
          $match: {
            userId: { $in: userIds },
            startedAt: { $gte: mStart },
          },
        },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
    ]);

    const costMap = Object.fromEntries(
      costAgg.map((r) => [r._id as string, r.total]),
    );
    const pipelineMap = Object.fromEntries(
      pipelineAgg.map((r) => [r._id as string, r.count]),
    );

    return {
      users: users.map((u) => ({
        _id: u.userId,
        userId: u.userId,
        email: u.email,
        displayName: displayName(u),
        createdAt: (u as { createdAt?: Date }).createdAt,
        lastActiveAt: u.lastLoginAt ?? null,
        isSuspended: u.status === UserStatus.DISABLED,
        role: u.role,
        costThisMonthUsd: costMap[u.userId] ?? 0,
        pipelinesThisMonth: pipelineMap[u.userId] ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.userModel
      .findOne(
        { userId },
        {
          password: 0,
        },
      )
      .lean();

    if (!user) throw new NotFoundException('User not found');

    const mStart = monthStart();

    const [
      ruleCount,
      workflowCount,
      pipelineCount,
      pipelineThisMonth,
      costThisMonth,
      costByProvider,
    ] = await Promise.all([
      this.ruleModel.countDocuments({ userId }),
      this.workflowModel.countDocuments({ userId }),
      this.pipelineModel.countDocuments({ userId }),
      this.pipelineModel.countDocuments({
        userId,
        startedAt: { $gte: mStart },
      }),
      this.costModel
        .aggregate([
          { $match: { userId, billingPeriod: mStart } },
          { $group: { _id: null, total: { $sum: '$costUsd' } } },
        ])
        .then((r) => r[0]?.total ?? 0),
      this.costModel.aggregate([
        { $match: { userId, billingPeriod: mStart } },
        { $group: { _id: '$provider', total: { $sum: '$costUsd' } } },
      ]),
    ]);

    const safeUser = {
      ...user,
      displayName: displayName(user),
      isSuspended: user.status === UserStatus.DISABLED,
      lastActiveAt: user.lastLoginAt ?? null,
    };

    return {
      user: safeUser,
      stats: {
        ruleCount,
        workflowCount,
        pipelineCount,
        pipelineThisMonth,
        costThisMonthUsd: costThisMonth,
        costByProvider: Object.fromEntries(
          costByProvider.map((r) => [r._id ?? 'unknown', r.total]),
        ),
      },
    };
  }

  async suspendUser(userId: string) {
    const user = await this.userModel.findOne({ userId });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot suspend an admin user');
    }
    user.status = UserStatus.DISABLED;
    await user.save();
    return { success: true, message: 'User suspended' };
  }

  async reactivateUser(userId: string) {
    const user = await this.userModel.findOne({ userId });
    if (!user) throw new NotFoundException('User not found');
    user.status = UserStatus.ACTIVE;
    await user.save();
    return { success: true, message: 'User reactivated' };
  }
}
