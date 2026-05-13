import type { UserRole } from '../users/schemas/user.schema';

/** JWT-local user context for row-level ownership (`User.userId`). */
export type TenancyAuth = {
  userId: string;
  role: UserRole;
};
