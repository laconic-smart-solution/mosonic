import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IFixedCostRepository } from '../repositories/interfaces/fixed-cost.repository.interface';
import { FIXED_COST_REPOSITORY } from '../repositories/tokens';
import { CreditCalculationService } from './credit-calculation.service';

@Injectable()
export class FixedCostService {
  constructor(
    @Inject(FIXED_COST_REPOSITORY)
    private readonly fixedCosts: IFixedCostRepository,
    private readonly calculation: CreditCalculationService,
  ) {}

  list() {
    return this.fixedCosts.listAllSorted();
  }

  async create(body: { name: string; amountUsd: number }) {
    const row = await this.fixedCosts.create({
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
    const row = await this.fixedCosts.updateById(fixedCostId, body);
    if (!row)
      throw new NotFoundException(`Fixed cost ${fixedCostId} not found`);
    await this.calculation.recalculateOverheadFactor();
    return row;
  }

  async softDelete(fixedCostId: string) {
    return this.update(fixedCostId, { isActive: false });
  }
}
