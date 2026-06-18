import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, type AnyBulkWriteOperation } from 'mongoose';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import { User, type UserDocument } from '../users/schemas/user.schema';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Plan, type PlanDocument } from './schemas/plan.schema';
import { UserPlan, type UserPlanDocument } from './schemas/user-plan.schema';

const DEFAULT_PLANS: CreatePlanDto[] = [
  {
    name: 'Basic',
    priceThb: 1200,
    priceUsd: 35,
    description: 'For individuals and small teams getting started.',
    features: ['All node types', 'Email support'],
  },
  {
    name: 'Professional',
    priceThb: 2000,
    priceUsd: 58,
    description: 'For growing teams with higher volume needs.',
    features: ['Priority support', 'Advanced workflows'],
  },
  {
    name: 'Enterprise',
    priceThb: 4000,
    priceUsd: 115,
    description: 'For agencies and enterprises at scale.',
    features: ['Dedicated support', 'Custom integrations'],
  },
];

@Injectable()
export class PlanService implements OnModuleInit {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    @InjectModel(UserPlan.name)
    private readonly userPlanModel: Model<UserPlanDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly calculation: CreditCalculationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapDefaultPlans();
    await this.bootstrapExistingUsers();
  }

  async getCreditsForPlan(plan: Pick<Plan, 'priceUsd'>): Promise<number> {
    const config = await this.calculation.getConfig();
    if (config.creditPriceUsd <= 0) return 0;
    return Math.floor(plan.priceUsd / config.creditPriceUsd);
  }

  async bootstrapDefaultPlans(): Promise<void> {
    for (const seed of DEFAULT_PLANS) {
      const existing = await this.planModel.findOne({ name: seed.name }).exec();
      if (existing) continue;
      await this.planModel.create({ ...seed, isActive: true });
      this.logger.log(`Seeded plan: ${seed.name}`);
    }
  }

  async bootstrapExistingUsers(): Promise<void> {
    const users = await this.userModel.find({}).select({ userId: 1 }).lean().exec();
    for (const row of users) {
      const userId = typeof row.userId === 'string' ? row.userId : '';
      if (!userId) continue;
      const hasPlan = await this.userPlanModel
        .exists({ userId, status: 'active' })
        .exec();
      if (!hasPlan) {
        await this.assignDefaultPlan(userId);
      }
    }
  }

  async listPlans() {
    const plans = await this.planModel.find({}).sort({ priceThb: 1 }).lean().exec();
    const counts = await this.userPlanModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { status: 'active' } },
        { $group: { _id: '$planId', count: { $sum: 1 } } },
      ])
      .exec();
    const countMap = new Map(counts.map((c) => [c._id, c.count]));
    const withCredits = await Promise.all(
      plans.map(async (p) => ({
        ...p,
        creditsPerMonth: await this.getCreditsForPlan(p),
        activeUsers: countMap.get(p.planId as string) ?? 0,
      })),
    );
    return withCredits;
  }

  async createPlan(dto: CreatePlanDto) {
    return this.planModel.create({
      ...dto,
      isActive: dto.isActive ?? true,
      features: dto.features ?? [],
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.planModel
      .findOneAndUpdate({ planId }, { $set: dto }, { new: true })
      .exec();
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    return plan;
  }

  async softDeletePlan(planId: string) {
    const plan = await this.planModel
      .findOneAndUpdate({ planId }, { $set: { isActive: false } }, { new: true })
      .exec();
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    return plan;
  }

  async getPlanUsers(planId: string, page = 1, limit = 20) {
    const plan = await this.planModel.findOne({ planId }).lean().exec();
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    const filter = { planId, status: 'active' as const };
    const [users, total] = await Promise.all([
      this.userPlanModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.userPlanModel.countDocuments(filter).exec(),
    ]);

    const userIds = users.map((u) => u.userId);
    const userDocs = await this.userModel
      .find({ userId: { $in: userIds } })
      .select({ userId: 1, email: 1, displayName: 1, firstName: 1, lastName: 1 })
      .lean()
      .exec();
    const userMap = new Map(userDocs.map((u) => [u.userId, u]));

    return {
      plan: {
        ...plan,
        creditsPerMonth: await this.getCreditsForPlan(plan),
      },
      users: users.map((up) => {
        const u = userMap.get(up.userId);
        return {
          userId: up.userId,
          email: u?.email,
          displayName:
            ((u as { displayName?: string })?.displayName ??
              [u?.firstName, u?.lastName].filter(Boolean).join(' ')) ||
            undefined,
          creditsUsed: up.creditsUsed,
          creditsRemaining: up.creditsRemaining,
        };
      }),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async assignUserToPlan(planId: string, userId: string): Promise<UserPlanDocument> {
    const plan = await this.planModel.findOne({ planId, isActive: true }).exec();
    if (!plan) {
      throw new NotFoundException(`Active plan ${planId} not found`);
    }

    const credits = await this.getCreditsForPlan(plan);
    const billingPeriod = currentBillingPeriod();

    await this.userPlanModel
      .updateMany({ userId, status: 'active', planId: { $ne: planId } }, {
        $set: { status: 'suspended' },
      })
      .exec();

    const userPlan = await this.userPlanModel
      .findOneAndUpdate(
        { userId, status: 'active' },
        {
          $set: {
            userId,
            planId,
            creditsPerMonth: credits,
            billingPeriod,
            creditsUsed: 0,
            creditsRemaining: credits,
            status: 'active',
            lowBalanceNotifiedAt: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return userPlan!;
  }

  async assignDefaultPlan(userId: string): Promise<UserPlanDocument | null> {
    const plan = await this.planModel
      .findOne({ isActive: true })
      .sort({ priceThb: 1 })
      .exec();
    if (!plan) {
      this.logger.warn('No active plan for assignDefaultPlan');
      return null;
    }
    return this.assignUserToPlan(plan.planId, userId);
  }

  async getUserPlan(userId: string) {
    const userPlan = await this.userPlanModel
      .findOne({ userId, status: 'active' })
      .lean()
      .exec();
    if (!userPlan) return null;
    const plan = await this.planModel.findOne({ planId: userPlan.planId }).lean().exec();
    const creditsPerMonth = plan
      ? await this.getCreditsForPlan(plan)
      : userPlan.creditsPerMonth;
    return {
      userPlan,
      plan: plan ? { ...plan, creditsPerMonth } : null,
    };
  }

  @Cron('0 0 1 * *')
  async resetMonthlyCredits(): Promise<void> {
    const billingPeriod = currentBillingPeriod();
    const activePlans = await this.userPlanModel
      .find({ status: 'active' })
      .lean()
      .exec();

    const planIds = [...new Set(activePlans.map((up) => up.planId))];
    const plans = await this.planModel
      .find({ planId: { $in: planIds } })
      .lean()
      .exec();
    const planMap = new Map(plans.map((p) => [p.planId, p]));

    const bulkOps: AnyBulkWriteOperation<UserPlanDocument>[] = [];
    for (const up of activePlans) {
      const plan = planMap.get(up.planId);
      if (!plan) continue;
      const credits = await this.getCreditsForPlan(plan);
      bulkOps.push({
        updateOne: {
          filter: { _id: up._id },
          update: {
            $set: {
              creditsPerMonth: credits,
              creditsUsed: 0,
              creditsRemaining: credits,
              billingPeriod,
              lowBalanceNotifiedAt: null,
            },
          },
        },
      });
    }

    if (bulkOps.length > 0) {
      await this.userPlanModel.bulkWrite(bulkOps);
    }

    this.logger.log(`Monthly credit reset for ${bulkOps.length} user plans`);
  }
}
