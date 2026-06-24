import { Inject, Injectable } from '@nestjs/common';
import type { CreditConfigRecord } from '../domain/credit/credit.types';
import type { ICreditConfigRepository } from '../repositories/interfaces/credit-config.repository.interface';
import { CREDIT_CONFIG_REPOSITORY } from '../repositories/tokens';
import { CreditCalculationService } from './credit-calculation.service';
import { UpdateCreditConfigDto } from './dto/update-credit-config.dto';

@Injectable()
export class CreditConfigService {
  constructor(
    @Inject(CREDIT_CONFIG_REPOSITORY)
    private readonly creditConfig: ICreditConfigRepository,
    private readonly calculation: CreditCalculationService,
  ) {}

  getConfig(): Promise<CreditConfigRecord> {
    return this.calculation.getConfig();
  }

  async getCreditPriceUsd(): Promise<number> {
    const config = await this.getConfig();
    return config.creditPriceUsd;
  }

  async updateConfig(
    dto: UpdateCreditConfigDto,
    adminUserId: string,
  ): Promise<CreditConfigRecord> {
    const config = await this.getConfig();
    const next = {
      creditPriceUsd: dto.creditPriceUsd ?? config.creditPriceUsd,
      marginTarget: dto.marginTarget ?? config.marginTarget,
      basicUsersPerMonth: dto.basicUsersPerMonth ?? config.basicUsersPerMonth,
    };

    await this.creditConfig.upsertSingleton(next, {
      creditPriceUsd: next.creditPriceUsd,
      marginTarget: next.marginTarget,
      basicUsersPerMonth: next.basicUsersPerMonth,
      overheadFactor: config.overheadFactor,
      changedAt: new Date(),
      changedBy: adminUserId,
    });

    await this.calculation.recalculateOverheadFactor();
    return this.getConfig();
  }

  async getConfigHistory(page = 1, limit = 20) {
    const config = await this.getConfig();
    const history = [
      ...(Array.isArray(config.changeHistory)
        ? (config.changeHistory as unknown[])
        : []),
    ].reverse();
    const total = history.length;
    const start = (page - 1) * limit;
    const entries = history.slice(start, start + limit);
    return {
      entries,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  recalculateOverheadFactor(): Promise<number> {
    return this.calculation.recalculateOverheadFactor();
  }
}
