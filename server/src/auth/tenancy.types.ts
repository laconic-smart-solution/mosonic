import type { UserRole } from '../domain/users/user.types';

/** JWT-local user context for row-level ownership (`User.userId`). */
export type TenancyAuth = {
  userId: string;
  role: UserRole;
};
