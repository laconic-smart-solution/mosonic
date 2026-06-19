import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreditConfigRecord } from '../../domain/credit/credit.types';
import type { CreditConfigChangeHistoryEntry } from '../../domain/credit/credit.types';
import {
  CONFIG_SINGLETON_KEY,
  type ICreditConfigRepository,
} from '../interfaces/credit-config.repository.interface';

@Injectable()
export class PrismaCreditConfigRepository implements ICreditConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSingleton(): Promise<CreditConfigRecord | null> {
    return this.prisma.creditConfig.findUnique({
      where: { singletonKey: CONFIG_SINGLETON_KEY },
    });
  }

  createSingleton(
    data: Prisma.CreditConfigCreateInput,
  ): Promise<CreditConfigRecord> {
    return this.prisma.creditConfig.create({ data });
  }

  async upsertSingleton(
    data: {
      creditPriceUsd: number;
      marginTarget: number;
      basicUsersPerMonth: number;
    },
    historyEntry: CreditConfigChangeHistoryEntry,
  ): Promise<CreditConfigRecord> {
    const existing = await this.findSingleton();
    const history = Array.isArray(existing?.changeHistory)
      ? [...(existing.changeHistory as unknown[]), historyEntry]
      : [historyEntry];

    return this.prisma.creditConfig.upsert({
      where: { singletonKey: CONFIG_SINGLETON_KEY },
      create: {
        singletonKey: CONFIG_SINGLETON_KEY,
        ...data,
        changeHistory: history as Prisma.InputJsonValue,
      },
      update: {
        ...data,
        changeHistory: history as Prisma.InputJsonValue,
      },
    });
  }

  updateOverhead(overheadFactor: number, derivedMargin: number): Promise<void> {
    return this.prisma.creditConfig
      .update({
        where: { singletonKey: CONFIG_SINGLETON_KEY },
        data: { overheadFactor, derivedMargin },
      })
      .then(() => undefined);
  }

  async migrateLegacyFields(
    set: Prisma.CreditConfigUpdateInput,
    unsetKeys: string[],
  ): Promise<void> {
    const data = { ...set } as Prisma.CreditConfigUpdateInput;
    for (const key of unsetKeys) {
      (data as Record<string, unknown>)[key] = undefined;
    }
    await this.prisma.creditConfig.update({
      where: { singletonKey: CONFIG_SINGLETON_KEY },
      data,
    });
  }
}
