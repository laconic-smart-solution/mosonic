import type { Prisma, ServiceRateType } from '@prisma/client';
import type { ServiceRateRecord } from '../../domain/credit/credit.types';

export interface IServiceRateRepository {
  count(): Promise<number>;
  insertMany(data: Prisma.ServiceRateCreateManyInput[]): Promise<void>;
  listAll(): Promise<ServiceRateRecord[]>;
  findFirstActiveByType(
    serviceType: ServiceRateType,
  ): Promise<ServiceRateRecord | null>;
  create(data: Prisma.ServiceRateCreateInput): Promise<ServiceRateRecord>;
  updateById(
    serviceRateId: string,
    data: Prisma.ServiceRateUpdateInput,
  ): Promise<ServiceRateRecord | null>;
  findActiveRate(criteria: {
    serviceType: ServiceRateType;
    model: string;
    provider?: string;
  }): Promise<ServiceRateRecord | null>;
}
