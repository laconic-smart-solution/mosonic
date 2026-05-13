jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

jest.mock('./analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

import { AnalyticsController } from './analytics.controller';
import type { User } from '../users/schemas/user.schema';
import { UserRole } from '../users/schemas/user.schema';

describe('AnalyticsController', () => {
  const analyticsService = {
    manualPull: jest.fn(),
    generateSuggestions: jest.fn(),
  };
  const analyticsRepository = {};

  const controller = new AnalyticsController(
    analyticsService as never,
    analyticsRepository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST pull/:ruleId delegates to manualPull with tenancy from request user', async () => {
    analyticsService.manualPull.mockResolvedValue({ analyticsId: 'analytics-1' });
    const mockUser = { userId: 'user-1', role: UserRole.CUSTOMER } as User;
    const req = { auth: { localUser: mockUser } };

    const out = await controller.pull('rule-abc', req as never);

    expect(out).toEqual({ analyticsId: 'analytics-1' });
    expect(analyticsService.manualPull).toHaveBeenCalledWith('rule-abc', {
      userId: 'user-1',
      role: UserRole.CUSTOMER,
    });
  });

  it('POST :analyticsId/suggestions/generate delegates to generateSuggestions', async () => {
    analyticsService.generateSuggestions.mockResolvedValue({
      analyticsId: 'analytics-1',
      suggestionCount: 3,
    });
    const mockUser = { userId: 'user-1', role: UserRole.CUSTOMER } as User;
    const req = { auth: { localUser: mockUser } };

    const out = await controller.generateSuggestions(
      'analytics-1',
      req as never,
    );

    expect(out).toEqual({ analyticsId: 'analytics-1', suggestionCount: 3 });
    expect(analyticsService.generateSuggestions).toHaveBeenCalledWith(
      'analytics-1',
      { userId: 'user-1', role: UserRole.CUSTOMER },
    );
  });
});
