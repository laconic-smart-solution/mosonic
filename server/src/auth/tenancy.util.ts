import { UserRole } from '../users/schemas/user.schema';
import type { User } from '../users/schemas/user.schema';
import type { TenancyAuth } from './tenancy.types';

/**
 * Merge Mongo filters with tenant scope.
 * - CUSTOMER: restricts to `userId` (legacy docs without `userId` are invisible).
 * - ADMIN: no extra filter (sees all rows, including legacy without `userId`).
 */
export function mergeUserIdFilter(
  filter: Record<string, unknown>,
  auth: TenancyAuth,
): Record<string, unknown> {
  if (auth.role === UserRole.ADMIN) {
    return { ...filter };
  }
  return { ...filter, userId: auth.userId };
}

export function tenancyFromLocalUser(user: User): TenancyAuth {
  return { userId: user.userId, role: user.role };
}
