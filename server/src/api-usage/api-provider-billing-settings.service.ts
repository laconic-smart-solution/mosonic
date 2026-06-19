import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ApiProviderId } from './api-provider.types';

@Injectable()
export class ApiProviderBillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSettings(provider: ApiProviderId) {
    return this.prisma.apiProviderBillingSettings.upsert({
      where: { provider },
      create: { provider },
      update: {},
    });
  }

  async getPrepaidCreditUsd(provider: ApiProviderId): Promise<number> {
    const settings = await this.ensureSettings(provider);
    return settings.prepaidCreditUsd;
  }

  async updatePrepaidCreditUsd(
    provider: ApiProviderId,
    prepaidCreditUsd: number,
    updatedBy: string,
  ) {
    return this.prisma.apiProviderBillingSettings.upsert({
      where: { provider },
      create: { provider, prepaidCreditUsd, updatedBy },
      update: { prepaidCreditUsd, updatedBy },
    });
  }
}
