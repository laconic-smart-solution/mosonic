import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ServiceRateType } from '@prisma/client';
import type { IServiceRateRepository } from '../repositories/interfaces/service-rate.repository.interface';
import { SERVICE_RATE_REPOSITORY } from '../repositories/tokens';

@Injectable()
export class ServiceRateService {
  constructor(
    @Inject(SERVICE_RATE_REPOSITORY)
    private readonly serviceRates: IServiceRateRepository,
  ) {}

  list() {
    return this.serviceRates.listAll();
  }

  async create(body: {
    serviceType: ServiceRateType;
    provider: string;
    model: string;
    avgPricePerCall?: number;
    pricePerImage?: number;
    pricePerSecond?: number;
  }) {
    return this.serviceRates.create({
      ...body,
      isActive: true,
    });
  }

  async update(
    serviceRateId: string,
    body: Partial<{
      provider: string;
      model: string;
      avgPricePerCall: number;
      pricePerImage: number;
      pricePerSecond: number;
      isActive: boolean;
    }>,
  ) {
    const row = await this.serviceRates.updateById(serviceRateId, body);
    if (!row)
      throw new NotFoundException(`Service rate ${serviceRateId} not found`);
    return row;
  }

  async softDelete(serviceRateId: string) {
    return this.update(serviceRateId, { isActive: false });
  }
}
