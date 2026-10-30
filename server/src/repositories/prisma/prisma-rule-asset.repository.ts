import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  IRuleAssetRepository,
  RuleAssetChunkRecord,
  RuleAssetRecord,
} from '../interfaces/rule-asset.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaRuleAssetRepository implements IRuleAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    ruleAssetId: string,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ ruleAssetId }, auth)
      : { ruleAssetId };
    return this.prisma.ruleAsset.findFirst({ where });
  }

  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord[]> {
    const where = auth ? mergeTenancyWhere({ ruleId }, auth) : { ruleId };
    return this.prisma.ruleAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.RuleAssetCreateInput): Promise<RuleAssetRecord> {
    return this.prisma.ruleAsset.create({ data });
  }

  async updateById(
    ruleAssetId: string,
    data: Prisma.RuleAssetUpdateInput,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ ruleAssetId }, auth)
      : { ruleAssetId };
    const existing = await this.prisma.ruleAsset.findFirst({ where });
    if (!existing) return null;
    return this.prisma.ruleAsset.update({ where: { ruleAssetId }, data });
  }

  async deleteById(ruleAssetId: string, auth?: TenancyAuth): Promise<boolean> {
    const where = auth
      ? mergeTenancyWhere({ ruleAssetId }, auth)
      : { ruleAssetId };
    const existing = await this.prisma.ruleAsset.findFirst({ where });
    if (!existing) return false;
    await this.prisma.ruleAsset.delete({ where: { ruleAssetId } });
    return true;
  }

  async createChunks(
    ruleAssetId: string,
    chunks: { chunkIndex: number; text: string; embedding: unknown }[],
  ): Promise<RuleAssetChunkRecord[]> {
    if (chunks.length === 0) return [];
    await this.prisma.ruleAssetChunk.createMany({
      data: chunks.map((c) => ({
        ruleAssetId,
        chunkIndex: c.chunkIndex,
        text: c.text,
        embedding: c.embedding as Prisma.InputJsonValue,
      })),
    });
    return this.prisma.ruleAssetChunk.findMany({
      where: { ruleAssetId },
      orderBy: { chunkIndex: 'asc' },
    });
  }

  findChunksByRuleId(ruleId: string): Promise<RuleAssetChunkRecord[]> {
    return this.prisma.ruleAssetChunk.findMany({
      where: { ruleAsset: { ruleId } },
      orderBy: [{ ruleAssetId: 'asc' }, { chunkIndex: 'asc' }],
    });
  }
}
