import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  BudgetSettingsRecord,
  IBudgetSettingsRepository,
} from '../interfaces/budget-settings.repository.interface';

@Injectable()
export class PrismaBudgetSettingsRepository implements IBudgetSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<BudgetSettingsRecord | null> {
    return this.prisma.budgetSettings.findUnique({ where: { userId } });
  }

  upsertByUserId(
    userId: string,
    data: Omit<Prisma.BudgetSettingsCreateInput, 'userId'>,
  ): Promise<BudgetSettingsRecord> {
    return this.prisma.budgetSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
