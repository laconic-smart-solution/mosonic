import type { User as PrismaUser } from '@prisma/client';
import { UserRole, UserStatus } from '@prisma/client';

export { UserRole, UserStatus };

export type UserRecord = PrismaUser;

export type ZernioConnectedAccountJson = {
  channel: string;
  accountId: string;
  connectedAt: string | Date;
};
