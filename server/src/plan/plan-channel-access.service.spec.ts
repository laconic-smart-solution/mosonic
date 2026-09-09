import type { ModuleRef } from '@nestjs/core';
import { SocialProvider } from '@prisma/client';
import { PlanChannelAccessService } from './plan-channel-access.service';

const disconnectAccount = jest.fn().mockResolvedValue(undefined);
const rednoteDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

jest.mock('../mcp/mcp.service', () => ({
  McpService: class McpService {
    disconnectAccount = disconnectAccount;
  },
}));

jest.mock('../rednote/rednote.service', () => ({
  RedNoteService: class RedNoteService {
    disconnect = rednoteDisconnect;
  },
}));

describe('PlanChannelAccessService', () => {
  const plans = {
    findByPlanId: jest.fn(),
  };
  const userPlans = {
    findActiveByUserId: jest.fn(),
  };
  const socialAccounts = {
    findActiveByUserId: jest.fn(),
  };
  const moduleRef = {
    get: jest.fn((token: { name: string }) => {
      if (token.name === 'McpService') return { disconnectAccount };
      if (token.name === 'RedNoteService') return { disconnect: rednoteDisconnect };
      return undefined;
    }),
  } as unknown as jest.Mocked<ModuleRef>;

  const service = new PlanChannelAccessService(
    plans as never,
    userPlans as never,
    socialAccounts as never,
    moduleRef,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isChannelAllowed', () => {
    it('returns true when the channel is in the active plan allowedChannels', async () => {
      userPlans.findActiveByUserId.mockResolvedValue({ planId: 'p1' });
      plans.findByPlanId.mockResolvedValue({
        planId: 'p1',
        allowedChannels: ['facebook', 'rednote'],
      });

      await expect(service.isChannelAllowed('u1', 'Facebook')).resolves.toBe(
        true,
      );
    });

    it('returns false when the channel is not in the active plan allowedChannels', async () => {
      userPlans.findActiveByUserId.mockResolvedValue({ planId: 'p1' });
      plans.findByPlanId.mockResolvedValue({
        planId: 'p1',
        allowedChannels: ['facebook'],
      });

      await expect(service.isChannelAllowed('u1', 'instagram')).resolves.toBe(
        false,
      );
    });

    it('returns false when the user has no active plan', async () => {
      userPlans.findActiveByUserId.mockResolvedValue(null);

      await expect(service.isChannelAllowed('u1', 'facebook')).resolves.toBe(
        false,
      );
      expect(plans.findByPlanId).not.toHaveBeenCalled();
    });
  });

  describe('enforceChannelAccessForNewPlan', () => {
    it('disconnects only channels the new plan no longer allows, via the right service per provider', async () => {
      plans.findByPlanId.mockResolvedValue({
        planId: 'p2',
        allowedChannels: ['facebook'],
      });
      socialAccounts.findActiveByUserId.mockResolvedValue([
        { channel: 'facebook', provider: SocialProvider.ZERNIO },
        { channel: 'instagram', provider: SocialProvider.ZERNIO },
        { channel: 'rednote', provider: SocialProvider.REDNOTE },
      ]);

      await service.enforceChannelAccessForNewPlan('u1', 'p2');

      expect(disconnectAccount).toHaveBeenCalledTimes(1);
      expect(disconnectAccount).toHaveBeenCalledWith('u1', 'instagram');
      expect(rednoteDisconnect).toHaveBeenCalledTimes(1);
      expect(rednoteDisconnect).toHaveBeenCalledWith('u1');
    });

    it('disconnects nothing when every active channel is still allowed', async () => {
      plans.findByPlanId.mockResolvedValue({
        planId: 'p2',
        allowedChannels: ['facebook', 'instagram'],
      });
      socialAccounts.findActiveByUserId.mockResolvedValue([
        { channel: 'facebook', provider: SocialProvider.ZERNIO },
        { channel: 'instagram', provider: SocialProvider.ZERNIO },
      ]);

      await service.enforceChannelAccessForNewPlan('u1', 'p2');

      expect(disconnectAccount).not.toHaveBeenCalled();
      expect(rednoteDisconnect).not.toHaveBeenCalled();
    });

    it('does not throw when a disconnect fails, and still processes remaining channels', async () => {
      plans.findByPlanId.mockResolvedValue({
        planId: 'p2',
        allowedChannels: [],
      });
      socialAccounts.findActiveByUserId.mockResolvedValue([
        { channel: 'facebook', provider: SocialProvider.ZERNIO },
        { channel: 'rednote', provider: SocialProvider.REDNOTE },
      ]);
      disconnectAccount.mockRejectedValueOnce(new Error('zernio down'));

      await expect(
        service.enforceChannelAccessForNewPlan('u1', 'p2'),
      ).resolves.toBeUndefined();

      expect(disconnectAccount).toHaveBeenCalledWith('u1', 'facebook');
      expect(rednoteDisconnect).toHaveBeenCalledWith('u1');
    });

    it('treats a plan with no allowedChannels as allowing nothing', async () => {
      plans.findByPlanId.mockResolvedValue(null);
      socialAccounts.findActiveByUserId.mockResolvedValue([
        { channel: 'facebook', provider: SocialProvider.ZERNIO },
      ]);

      await service.enforceChannelAccessForNewPlan('u1', 'missing-plan');

      expect(disconnectAccount).toHaveBeenCalledWith('u1', 'facebook');
    });
  });
});
