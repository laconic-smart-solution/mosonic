import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CreditCalculationService } from './credit-calculation.service';
import { CreditConfig } from './schemas/credit-config.schema';
import { FixedCost } from './schemas/fixed-cost.schema';
import { Plan } from '../plan/schemas/plan.schema';
import { ServiceRate } from './schemas/service-rate.schema';

describe('CreditCalculationService', () => {
  let service: CreditCalculationService;
  let configUpdateOne: jest.Mock;
  const configStore: Record<string, unknown> = {
    singletonKey: 'default',
    creditPriceUsd: 0.01,
    marginTarget: 3,
    basicUsersPerMonth: 50,
    overheadFactor: 0.5,
    derivedMargin: 0,
    changeHistory: [],
    save: jest.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
  };

  beforeEach(async () => {
    configUpdateOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    const module = await Test.createTestingModule({
      providers: [
        CreditCalculationService,
        {
          provide: getModelToken(CreditConfig.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(configStore),
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({
                  ...configStore,
                  changeHistory: [],
                }),
              }),
            }),
            create: jest.fn(),
            updateOne: configUpdateOne,
          },
        },
        {
          provide: getModelToken(FixedCost.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              lean: () => ({
                exec: () => Promise.resolve([{ amountUsd: 700 }]),
              }),
            }),
          },
        },
        {
          provide: getModelToken(Plan.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              lean: () => ({
                exec: () => Promise.resolve({ priceUsd: 35 }),
              }),
            }),
          },
        },
        {
          provide: getModelToken(ServiceRate.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              lean: () => ({
                exec: () =>
                  Promise.resolve({
                    avgPricePerCall: 0.01,
                    serviceType: 'text',
                  }),
              }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(CreditCalculationService);
  });

  it('calculateCredits applies overhead, margin, and ceil', async () => {
    const result = await service.calculateCredits(0.1);
    expect(result.rawCostUsd).toBe(0.1);
    expect(result.overheadUsd).toBeCloseTo(0.05);
    expect(result.marginAppliedUsd).toBeCloseTo(0.45);
    expect(result.creditsCharged).toBe(46);
    expect(result.creditPriceUsdSnapshot).toBe(0.01);
  });

  it('recalculateOverheadFactor persists factor', async () => {
    const factor = await service.recalculateOverheadFactor();
    expect(factor).toBeGreaterThan(0);
    expect(configUpdateOne).toHaveBeenCalledWith(
      { singletonKey: 'default' },
      expect.objectContaining({
        $set: expect.objectContaining({ overheadFactor: factor }),
      }),
    );
  });

  it('previewWorkflow aggregates node totals', async () => {
    const result = await service.previewWorkflow([
      { serviceType: 'text', model: 'gpt-4o', count: 2 },
    ]);
    expect(result.nodes).toHaveLength(1);
    expect(result.totals.creditsCharged).toBeGreaterThan(0);
    expect(result.totals.revenueUsd).toBeCloseTo(
      result.totals.creditsCharged * 0.01,
    );
  });
});
