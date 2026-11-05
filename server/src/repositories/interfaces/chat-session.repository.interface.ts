import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';

export type ChatSessionRecord = {
  sessionId: string;
  ruleId: string | null;
  userId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface IChatSessionRepository {
  findById(
    sessionId: string,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord | null>;
  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord[]>;
  findByUserId(auth: TenancyAuth): Promise<ChatSessionRecord[]>;
  create(data: Prisma.ChatSessionCreateInput): Promise<ChatSessionRecord>;
  updateById(
    sessionId: string,
    data: Prisma.ChatSessionUpdateInput,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord | null>;
  deleteById(sessionId: string, auth?: TenancyAuth): Promise<boolean>;
}
