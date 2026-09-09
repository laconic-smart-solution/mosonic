import { Injectable } from '@nestjs/common';
import type { CreditTopupPurchaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreditTopupPurchaseRecord } from '../../domain/credit/credit.types';
import type { ICreditTopupPurchaseRepository } from '../interfaces/credit-topup-purchase.repository.interface';

@Injectable()
export class PrismaCreditTopupPurchaseRepository implements ICreditTopupPurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.CreditTopupPurchaseCreateInput,
  ): Promise<CreditTopupPurchaseRecord> {
    return this.prisma.creditTopupPurchase.create({ data });
  }

  findByTransactionId(
    transactionId: string,
  ): Promise<CreditTopupPurchaseRecord | null> {
    return this.prisma.creditTopupPurchase.findUnique({
      where: { transactionId },
    });
  }

  findByUserId(userId: string): Promise<CreditTopupPurchaseRecord[]> {
    return this.prisma.creditTopupPurchase.findMany({
      where: { userId },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async updateStatus(
    topupPurchaseId: string,
    status: CreditTopupPurchaseStatus,
  ): Promise<CreditTopupPurchaseRecord | null> {
    try {
      return await this.prisma.creditTopupPurchase.update({
        where: { topupPurchaseId },
        data: { status },
      });
    } catch {
      return null;
    }
  }
}
