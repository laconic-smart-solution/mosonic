import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  ChatSessionRecord,
  IChatSessionRepository,
} from '../interfaces/chat-session.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaChatSessionRepository implements IChatSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    sessionId: string,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord | null> {
    const where = auth ? mergeTenancyWhere({ sessionId }, auth) : { sessionId };
    return this.prisma.chatSession.findFirst({ where });
  }

  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord[]> {
    const where = auth ? mergeTenancyWhere({ ruleId }, auth) : { ruleId };
    return this.prisma.chatSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findByUserId(auth: TenancyAuth): Promise<ChatSessionRecord[]> {
    const where = mergeTenancyWhere({}, auth);
    return this.prisma.chatSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.ChatSessionCreateInput): Promise<ChatSessionRecord> {
    return this.prisma.chatSession.create({ data });
  }

  async updateById(
    sessionId: string,
    data: Prisma.ChatSessionUpdateInput,
    auth?: TenancyAuth,
  ): Promise<ChatSessionRecord | null> {
    const where = auth ? mergeTenancyWhere({ sessionId }, auth) : { sessionId };
    const existing = await this.prisma.chatSession.findFirst({ where });
    if (!existing) return null;
    return this.prisma.chatSession.update({ where: { sessionId }, data });
  }

  async deleteById(sessionId: string, auth?: TenancyAuth): Promise<boolean> {
    const where = auth ? mergeTenancyWhere({ sessionId }, auth) : { sessionId };
    const existing = await this.prisma.chatSession.findFirst({ where });
    if (!existing) return false;
    await this.prisma.chatSession.delete({ where: { sessionId } });
    return true;
  }
}
