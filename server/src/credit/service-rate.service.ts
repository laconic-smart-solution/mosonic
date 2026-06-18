import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ServiceRate,
  type ServiceRateDocument,
  type ServiceRateType,
} from './schemas/service-rate.schema';

@Injectable()
export class ServiceRateService {
  constructor(
    @InjectModel(ServiceRate.name)
    private readonly serviceRateModel: Model<ServiceRateDocument>,
  ) {}

  list() {
    return this.serviceRateModel.find({}).sort({ serviceType: 1, provider: 1 }).lean().exec();
  }

  async create(body: {
    serviceType: ServiceRateType;
    provider: string;
    model: string;
    avgPricePerCall?: number;
    pricePerImage?: number;
    pricePerSecond?: number;
  }) {
    return new this.serviceRateModel({
      ...body,
      isActive: true,
    }).save();
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
    const row = await this.serviceRateModel
      .findOneAndUpdate({ serviceRateId }, { $set: body }, { new: true })
      .exec();
    if (!row) throw new NotFoundException(`Service rate ${serviceRateId} not found`);
    return row;
  }

  async softDelete(serviceRateId: string) {
    return this.update(serviceRateId, { isActive: false });
  }
}
