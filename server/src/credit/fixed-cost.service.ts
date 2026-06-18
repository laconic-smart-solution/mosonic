import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditCalculationService } from './credit-calculation.service';
import {
  FixedCost,
  type FixedCostDocument,
} from './schemas/fixed-cost.schema';

@Injectable()
export class FixedCostService {
  constructor(
    @InjectModel(FixedCost.name)
    private readonly fixedCostModel: Model<FixedCostDocument>,
    private readonly calculation: CreditCalculationService,
  ) {}

  list() {
    return this.fixedCostModel.find({}).sort({ name: 1 }).lean().exec();
  }

  async create(body: { name: string; amountUsd: number }) {
    const row = await this.fixedCostModel.create({
      name: body.name.trim(),
      amountUsd: body.amountUsd,
      isActive: true,
    });
    await this.calculation.recalculateOverheadFactor();
    return row;
  }

  async update(
    fixedCostId: string,
    body: { name?: string; amountUsd?: number; isActive?: boolean },
  ) {
    const row = await this.fixedCostModel
      .findOneAndUpdate({ fixedCostId }, { $set: body }, { new: true })
      .exec();
    if (!row) throw new NotFoundException(`Fixed cost ${fixedCostId} not found`);
    await this.calculation.recalculateOverheadFactor();
    return row;
  }

  async softDelete(fixedCostId: string) {
    return this.update(fixedCostId, { isActive: false });
  }
}
