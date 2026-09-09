import { NotFoundException } from '@nestjs/common';
import { PlanService } from './plan.service';

describe('PlanService.assignUserToPlan', () => {
  const plans = {
    findByPlanId: jest.fn(),
  };
  const userPlans = {
    findActiveByUserId: jest.fn(),
    suspendOtherActivePlans: jest.fn().mockResolvedValue(undefined),
    upsertActivePlan: jest.fn(),
  };
  const users = {};
  const planPurchases = {};
  const calculation = {
    getConfig: jest.fn().mockResolvedValue({ creditPriceUsd: 0.01 }),
  };
  const channelAccess = {
    enforceChannelAccessForNewPlan: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PlanService(
    plans as never,
    userPlans as never,
    users as never,
    planPurchases as never,
    calculation as never,
    channelAccess as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    calculation.getConfig.mockResolvedValue({ creditPriceUsd: 0.01 });
    userPlans.upsertActivePlan.mockResolvedValue({
      userId: 'u1',
      planId: 'p2',
    });
  });

  it('enforces channel access when the user actually changes plan', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'p2',
      isActive: true,
      priceUsd: 10,
      creditsOverride: null,
    });
    userPlans.findActiveByUserId.mockResolvedValue({ planId: 'p1' });

    await service.assignUserToPlan('p2', 'u1');

    expect(channelAccess.enforceChannelAccessForNewPlan).toHaveBeenCalledWith(
      'u1',
      'p2',
    );
  });

  it('skips channel enforcement on a same-plan renewal', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'p1',
      isActive: true,
      priceUsd: 10,
      creditsOverride: null,
    });
    userPlans.findActiveByUserId.mockResolvedValue({ planId: 'p1' });

    await service.assignUserToPlan('p1', 'u1');

    expect(channelAccess.enforceChannelAccessForNewPlan).not.toHaveBeenCalled();
  });

  it('enforces channel access when the user had no previous plan', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'p1',
      isActive: true,
      priceUsd: 10,
      creditsOverride: null,
    });
    userPlans.findActiveByUserId.mockResolvedValue(null);

    await service.assignUserToPlan('p1', 'u1');

    expect(channelAccess.enforceChannelAccessForNewPlan).toHaveBeenCalledWith(
      'u1',
      'p1',
    );
  });

  it('does not let a channel-enforcement failure block the plan change', async () => {
    plans.findByPlanId.mockResolvedValue({
      planId: 'p2',
      isActive: true,
      priceUsd: 10,
      creditsOverride: null,
    });
    userPlans.findActiveByUserId.mockResolvedValue({ planId: 'p1' });
    channelAccess.enforceChannelAccessForNewPlan.mockRejectedValueOnce(
      new Error('disconnect failed'),
    );

    await expect(service.assignUserToPlan('p2', 'u1')).resolves.toEqual({
      userId: 'u1',
      planId: 'p2',
    });
  });

  it('throws when the target plan is not active', async () => {
    plans.findByPlanId.mockResolvedValue({ planId: 'p2', isActive: false });

    await expect(service.assignUserToPlan('p2', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(channelAccess.enforceChannelAccessForNewPlan).not.toHaveBeenCalled();
  });
});
