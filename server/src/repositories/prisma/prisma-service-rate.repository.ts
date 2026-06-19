import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceRateType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { ServiceRateRecord } from '../../domain/credit/credit.types';
import type { IServiceRateRepository } from '../interfaces/service-rate.repository.interface';

@Injectable()
export class PrismaServiceRateRepository implements IServiceRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  count(): Promise<number> {
    return this.prisma.serviceRate.count();
  }

  insertMany(data: Prisma.ServiceRateCreateManyInput[]): Promise<void> {
    return this.prisma.serviceRate.createMany({ data }).then(() => undefined);
  }

  listAll(): Promise<ServiceRateRecord[]> {
    return this.prisma.serviceRate.findMany({
      orderBy: [{ serviceType: 'asc' }, { provider: 'asc' }],
    });
  }

  create(data: Prisma.ServiceRateCreateInput): Promise<ServiceRateRecord> {
    return this.prisma.serviceRate.create({ data });
  }

  async updateById(
    serviceRateId: string,
    data: Prisma.ServiceRateUpdateInput,
  ): Promise<ServiceRateRecord | null> {
    try {
      return await this.prisma.serviceRate.update({
        where: { serviceRateId },
        data,
      });
    } catch {
      return null;
    }
  }

  findFirstActiveByType(
    serviceType: ServiceRateType,
  ): Promise<ServiceRateRecord | null> {
    return this.prisma.serviceRate.findFirst({
      where: { serviceType, isActive: true },
    });
  }

  findActiveRate(criteria: {
    serviceType: ServiceRateType;
    model: string;
    provider?: string;
  }): Promise<ServiceRateRecord | null> {
    return this.prisma.serviceRate.findFirst({
      where: {
        serviceType: criteria.serviceType,
        model: criteria.model,
        isActive: true,
        ...(criteria.provider ? { provider: criteria.provider } : {}),
      },
    });
  }
}
