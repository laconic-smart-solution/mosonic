import { Prisma } from '@prisma/client';
import { UserRole } from '../../domain/users/user.types';
import type { TenancyAuth } from '../../auth/tenancy.types';

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/** Apply tenant scope for Prisma `where` clauses (CUSTOMER → own userId). */
export function mergeTenancyWhere<T extends Record<string, unknown>>(
  where: T,
  auth: TenancyAuth,
): T & { userId?: string } {
  if (auth.role === UserRole.ADMIN) {
    return where;
  }
  return { ...where, userId: auth.userId };
}
