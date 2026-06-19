import { Module, OnModuleInit } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthModule } from '../auth/auth.module';
import { CostModule } from '../cost/cost.module';
import { EventsModule } from '../events/events.module';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { UserPlan, UserPlanSchema } from '../plan/schemas/user-plan.schema';
import { AdminNodeCreditController } from './admin-node-credit.controller';
import { CreditBillingService } from './credit-billing.service';
import { CreditCalculationService } from './credit-calculation.service';
import { CreditConfigController } from './credit-config.controller';
import { CreditConfigService } from './credit-config.service';
import { CreditTopupController } from './credit-topup.controller';
import { CreditService } from './credit.service';
import { FixedCostService } from './fixed-cost.service';
import { NodeCreditPriceService } from './node-credit-price.service';
import { OPERATION_REFERENCE_COSTS } from './lib/operation-reference-costs';
import {
  CreditConfig,
  CreditConfigSchema,
} from './schemas/credit-config.schema';
import {
  CreditLedger,
  CreditLedgerSchema,
} from './schemas/credit-ledger.schema';
import {
  CreditTopup,
  CreditTopupSchema,
} from './schemas/credit-topup.schema';
import {
  FixedCost,
  FixedCostSchema,
} from './schemas/fixed-cost.schema';
import {
  NodeCreditPrice,
  NodeCreditPriceSchema,
} from './schemas/node-credit-price.schema';
import {
  ServiceRate,
  ServiceRateSchema,
} from './schemas/service-rate.schema';
import { ServiceRateService } from './service-rate.service';

const DEFAULT_FIXED_COSTS = [
  { name: 'Infrastructure', amountUsd: 500 },
  { name: 'Maintenance', amountUsd: 200 },
];

const DEFAULT_SERVICE_RATES = [
  { serviceType: 'text' as const, provider: 'openai', model: 'gpt-4o', avgPricePerCall: 0.01 },
  { serviceType: 'text' as const, provider: 'openai', model: 'gpt-4o-mini', avgPricePerCall: 0.002 },
  { serviceType: 'text' as const, provider: 'openai', model: 'gpt-4.1', avgPricePerCall: 0.012 },
  { serviceType: 'image' as const, provider: 'openai', model: 'dall-e-3', pricePerImage: 0.04 },
  { serviceType: 'image' as const, provider: 'ideogram', model: 'ideogram-3', pricePerImage: 0.06 },
  { serviceType: 'video' as const, provider: 'openai', model: 'sora', pricePerSecond: 0.06 },
  { serviceType: 'video' as const, provider: 'heygen', model: 'heygen-av3', pricePerSecond: 0.0167 },
  { serviceType: 'video' as const, provider: 'heygen', model: 'heygen-av4', pricePerSecond: 0.02 },
  { serviceType: 'video' as const, provider: 'runway', model: 'runway-gen4', pricePerSecond: 0.025 },
];

@Module({
  imports: [
    AuthModule,
    CostModule,
    EventsModule,
    MongooseModule.forFeature([
      { name: CreditConfig.name, schema: CreditConfigSchema },
      { name: CreditLedger.name, schema: CreditLedgerSchema },
      { name: CreditTopup.name, schema: CreditTopupSchema },
      { name: UserPlan.name, schema: UserPlanSchema },
      { name: FixedCost.name, schema: FixedCostSchema },
      { name: ServiceRate.name, schema: ServiceRateSchema },
      { name: NodeCreditPrice.name, schema: NodeCreditPriceSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
  ],
  controllers: [
    CreditConfigController,
    AdminNodeCreditController,
    CreditTopupController,
  ],
  providers: [
    CreditConfigService,
    CreditBillingService,
    CreditCalculationService,
    CreditService,
    FixedCostService,
    ServiceRateService,
    NodeCreditPriceService,
  ],
  exports: [
    CreditConfigService,
    CreditBillingService,
    CreditCalculationService,
    CreditService,
    FixedCostService,
    ServiceRateService,
    NodeCreditPriceService,
    MongooseModule,
  ],
})
export class CreditModule implements OnModuleInit {
  constructor(
    @InjectModel(FixedCost.name)
    private readonly fixedCostModel: Model<FixedCost>,
    @InjectModel(ServiceRate.name)
    private readonly serviceRateModel: Model<ServiceRate>,
    private readonly calculation: CreditCalculationService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
    await this.nodeCreditPriceService.seedDefaults();
    await this.calculation.ensureLegacyConfigMigrated();
    await this.calculation.recalculateOverheadFactor();
  }

  private async seedDefaults(): Promise<void> {
    const fixedCount = await this.fixedCostModel.countDocuments().exec();
    if (fixedCount === 0) {
      await this.fixedCostModel.insertMany(
        DEFAULT_FIXED_COSTS.map((row) => ({ ...row, isActive: true })),
      );
    }

    const rateCount = await this.serviceRateModel.countDocuments().exec();
    if (rateCount === 0) {
      const fromRefs = OPERATION_REFERENCE_COSTS.map((op) => {
        if (op.nodeType.includes('video')) {
          return {
            serviceType: 'video' as const,
            provider: op.provider,
            model: op.provider === 'heygen' ? 'heygen-av3' : op.provider === 'runway' ? 'runway-gen4' : 'sora',
            pricePerSecond: op.costUsd / 30,
            isActive: true,
          };
        }
        if (op.nodeType.includes('image')) {
          return {
            serviceType: 'image' as const,
            provider: op.provider,
            model: op.provider === 'ideogram' ? 'ideogram-3' : 'dall-e-3',
            pricePerImage: op.costUsd,
            isActive: true,
          };
        }
        return {
          serviceType: 'text' as const,
          provider: op.provider,
          model: 'gpt-4o',
          avgPricePerCall: op.costUsd,
          isActive: true,
        };
      });
      const merged = [...DEFAULT_SERVICE_RATES];
      for (const row of fromRefs) {
        const exists = merged.some(
          (m) =>
            m.serviceType === row.serviceType &&
            m.provider === row.provider &&
            m.model === row.model,
        );
        if (!exists) merged.push(row);
      }
      await this.serviceRateModel.insertMany(merged);
    }
  }
}
