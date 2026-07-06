import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from '../events/events.service';
import { PayniService } from '../payni/payni.service';
import { PLAN_PURCHASE_REPOSITORY, PLAN_REPOSITORY } from '../repositories/tokens';
import { PlanService } from './plan.service';
import { PlanUpgradeService } from './plan-upgrade.service';

describe('PlanUpgradeService', () => {
  let service: PlanUpgradeService;

  const plans = {
    findByPlanId: jest.fn(),
  };
  const planPurchases = {
    create: jest.fn(),
    findByTransactionId: jest.fn(),
    findPendingByUserId: jest.fn(),
    updateStatus: jest.fn(),
  };
  const planService = {
    getUserPlan: jest.fn(),
    assignUserToPlan: jest.fn(),
    getCreditsForPlan: jest.fn(),
  };
  const payniService = {
    isPayniEnabled: jest.fn(),
    getCurrencyCode: jest.fn().mockReturnValue('THB'),
    createPayment: jest.fn(),
  };
  const events = {
    emitToRoom: jest.fn(),
    emitUserNotification: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanUpgradeService,
        { provide: PLAN_REPOSITORY, useValue: plans },
        { provide: PLAN_PURCHASE_REPOSITORY, useValue: planPurchases },
        { provide: PlanService, useValue: planService },
        { provide: PayniService, useValue: payniService },
        { provide: EventsService, useValue: events },
      ],
    }).compile();

    service = module.get(PlanUpgradeService);
  });

  it('rejects enterprise plan checkout', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'ent-1',
      name: 'Enterprise',
      priceThb: 10000,
      isActive: true,
    });

    await expect(service.initiateUpgrade('user-1', 'ent-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects downgrade to lower tier', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'basic-1',
      name: 'Basic',
      priceThb: 500,
      isActive: true,
    });
    planService.getUserPlan.mockResolvedValue({
      plan: { planId: 'pro-1', name: 'Professional', priceThb: 2000 },
    });

    await expect(
      service.initiateUpgrade('user-1', 'basic-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('instant mock assigns plan when Payni disabled', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'pro-1',
      name: 'Professional',
      priceThb: 2000,
      priceUsd: 60,
      isActive: true,
    });
    planService.getUserPlan.mockResolvedValue({
      plan: { planId: 'free-1', name: 'Free', priceThb: 0 },
    });
    payniService.isPayniEnabled.mockReturnValue(false);
    planService.assignUserToPlan.mockResolvedValue({
      userId: 'user-1',
      creditsRemaining: 5000,
    });
    planPurchases.create.mockResolvedValue({ planPurchaseId: 'purchase-1' });

    const result = await service.initiateUpgrade('user-1', 'pro-1');

    expect(result.instant?.planName).toBe('Professional');
    expect(planService.assignUserToPlan).toHaveBeenCalledWith('pro-1', 'user-1');
    expect(planPurchases.create).toHaveBeenCalled();
  });

  it('fulfills plan purchase webhook once', async () => {
    planPurchases.findByTransactionId.mockResolvedValue({
      planPurchaseId: 'purchase-1',
      userId: 'user-1',
      planId: 'pro-1',
      status: 'pending',
    });
    plans.findByPlanId.mockResolvedValue({ name: 'Professional' });
    planService.assignUserToPlan.mockResolvedValue({
      userId: 'user-1',
      creditsRemaining: 5000,
      creditsPerMonth: 5000,
    });

    await service.handlePlanPurchaseWebhook('txn-1', 'SUCCESS');

    expect(planPurchases.updateStatus).toHaveBeenCalledWith('purchase-1', 'active');
    expect(planService.assignUserToPlan).toHaveBeenCalledWith('pro-1', 'user-1');
    expect(events.emitToRoom).toHaveBeenCalled();
  });

  it('throws when target plan missing', async () => {
    plans.findByPlanId.mockResolvedValue(null);

    await expect(service.initiateUpgrade('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
