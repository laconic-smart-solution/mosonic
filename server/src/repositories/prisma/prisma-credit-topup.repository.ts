import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreditTopupRecord } from '../../domain/credit/credit.types';
import type { ICreditTopupRepository } from '../interfaces/credit-topup.repository.interface';

@Injectable()
export class PrismaCreditTopupRepository implements ICreditTopupRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CreditTopupCreateInput): Promise<CreditTopupRecord> {
    return this.prisma.creditTopup.create({ data });
  }
}
