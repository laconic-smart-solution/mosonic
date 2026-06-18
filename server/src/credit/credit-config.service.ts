import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditCalculationService } from './credit-calculation.service';
import { UpdateCreditConfigDto } from './dto/update-credit-config.dto';
import {
  CreditConfig,
  type CreditConfigDocument,
} from './schemas/credit-config.schema';

const CONFIG_SINGLETON_KEY = 'default';

function singletonFilter() {
  return { singletonKey: CONFIG_SINGLETON_KEY };
}

@Injectable()
export class CreditConfigService {
  constructor(
    @InjectModel(CreditConfig.name)
    private readonly configModel: Model<CreditConfigDocument>,
    private readonly calculation: CreditCalculationService,
  ) {}

  getConfig(): Promise<CreditConfigDocument> {
    return this.calculation.getConfig();
  }

  async getCreditPriceUsd(): Promise<number> {
    const config = await this.getConfig();
    return config.creditPriceUsd;
  }

  async updateConfig(
    dto: UpdateCreditConfigDto,
    adminUserId: string,
  ): Promise<CreditConfigDocument> {
    const config = await this.getConfig();
    const next = {
      creditPriceUsd: dto.creditPriceUsd ?? config.creditPriceUsd,
      marginTarget: dto.marginTarget ?? config.marginTarget,
      basicUsersPerMonth: dto.basicUsersPerMonth ?? config.basicUsersPerMonth,
    };

    await this.configModel
      .findOneAndUpdate(
        singletonFilter(),
        {
          $set: {
            singletonKey: CONFIG_SINGLETON_KEY,
            ...next,
          },
          $push: {
            changeHistory: {
              creditPriceUsd: next.creditPriceUsd,
              marginTarget: next.marginTarget,
              basicUsersPerMonth: next.basicUsersPerMonth,
              overheadFactor: config.overheadFactor,
              changedAt: new Date(),
              changedBy: adminUserId,
            },
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    await this.calculation.recalculateOverheadFactor();
    return this.getConfig();
  }

  async getConfigHistory(page = 1, limit = 20) {
    const config = await this.getConfig();
    const history = [...(config.changeHistory ?? [])].reverse();
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
