import type { Prisma, UserRole, UserStatus } from '@prisma/client';
import type { UserRecord } from '../../domain/users/user.types';

export interface IUserRepository {
  findByUserId(userId: string): Promise<UserRecord | null>;
  findByAuthServerUserId(authServerUserId: string): Promise<UserRecord | null>;
  findByZernioProfileId(profileId: string): Promise<UserRecord | null>;
  findByEmailOrUsernameInsensitive(
    email?: string,
    username?: string,
  ): Promise<UserRecord | null>;
  create(data: Prisma.UserCreateInput): Promise<UserRecord>;
  update(
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<UserRecord | null>;
  updateManyByAuthServerUserIds(
    authServerUserIds: string[],
    data: Prisma.UserUpdateManyMutationInput,
  ): Promise<number>;
  deleteByUserId(userId: string): Promise<boolean>;
  listAllUserIds(): Promise<string[]>;
  listWithZernioAccounts(): Promise<
    Array<Pick<UserRecord, 'userId' | 'zernioConnectedAccounts'>>
  >;
  listForEmailDedupe(): Promise<
    Array<Pick<UserRecord, 'userId' | 'email' | 'createdAt'>>
  >;
  findManyByUserIds(
    userIds: string[],
    select?: Prisma.UserSelect,
  ): Promise<UserRecord[]>;
  searchAdmin(
    query: string,
    page: number,
    limit: number,
  ): Promise<{ rows: UserRecord[]; total: number }>;
  listAdmin(
    filter: { search?: string; status?: UserStatus },
    page: number,
    limit: number,
  ): Promise<{ rows: UserRecord[]; total: number }>;
  count(where?: Prisma.UserWhereInput): Promise<number>;
  findCreatedSince(since: Date): Promise<Array<Pick<UserRecord, 'createdAt'>>>;
}

export type CreateUserInput = {
  authServerUserId: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  status?: UserStatus;
  lastLoginAt?: Date;
};
