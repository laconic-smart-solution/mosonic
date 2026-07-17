import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { IFixedCostRepository } from '../repositories/interfaces/fixed-cost.repository.interface';
import type { IServiceRateRepository } from '../repositories/interfaces/service-rate.repository.interface';
import {
  FIXED_COST_REPOSITORY,
  SERVICE_RATE_REPOSITORY,
} from '../repositories/tokens';
import { AdminNodeCreditController } from './admin-node-credit.controller';
import { CreditBillingService } from './credit-billing.service';
import { CreditCalculationService } from './credit-calculation.service';
import { CreditConfigController } from './credit-config.controller';
import { CreditConfigService } from './credit-config.service';
import { CreditTopupController } from './credit-topup.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';
import { ContentCreditUsageService } from './content-credit-usage.service';
import { CreditService } from './credit.service';
import { FixedCostService } from './fixed-cost.service';
import { NodeCreditPriceService } from './node-credit-price.service';
import { OPERATION_REFERENCE_COSTS } from './lib/operation-reference-costs';
import { ServiceRateService } from './service-rate.service';
import { AuthModule } from '../auth/auth.module';
import { CostModule } from '../cost/cost.module';
import { EventsModule } from '../events/events.module';
import { LineModule } from '../line/line.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ViberModule } from '../viber/viber.module';
import { PayniModule } from '../payni/payni.module';
import { PaymentModule } from '../payment/payment.module';
import { PlanModule } from '../plan/plan.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ConfigModule } from '@nestjs/config';
import { Module, forwardRef } from '@nestjs/common';

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
    ConfigModule,
    AuthModule,
    CostModule,
    EventsModule,
    forwardRef(() => LineModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ViberModule),
    PayniModule,
    PaymentModule,
    forwardRef(() => PlanModule),
    RepositoriesModule,
  ],
  controllers: [
    CreditConfigController,
    AdminNodeCreditController,
    CreditTopupController,
    PaymentWebhookController,
  ],
  providers: [
    CreditConfigService,
    CreditBillingService,
    CreditCalculationService,
    CreditService,
    ContentCreditUsageService,
    FixedCostService,
    PaymentWebhookService,
    ServiceRateService,
    NodeCreditPriceService,
  ],
  exports: [
    CreditConfigService,
    CreditBillingService,
    CreditCalculationService,
    CreditService,
    ContentCreditUsageService,
    FixedCostService,
    ServiceRateService,
    NodeCreditPriceService,
  ],
})
export class CreditModule implements OnModuleInit {
  constructor(
    @Inject(FIXED_COST_REPOSITORY)
    private readonly fixedCosts: IFixedCostRepository,
    @Inject(SERVICE_RATE_REPOSITORY)
    private readonly serviceRates: IServiceRateRepository,
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
    const fixedCount = await this.fixedCosts.count();
    if (fixedCount === 0) {
      await this.fixedCosts.insertMany(
        DEFAULT_FIXED_COSTS.map((row) => ({ ...row, isActive: true })),
      );
    }

    const rateCount = await this.serviceRates.count();
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
      await this.serviceRates.insertMany(merged);
    }
  }
}
