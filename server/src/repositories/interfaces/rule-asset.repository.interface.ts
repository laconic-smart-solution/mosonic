import type { Prisma, RuleAssetStatus, RuleAssetType } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';

export type RuleAssetRecord = {
  ruleAssetId: string;
  ruleId: string;
  userId: string | null;
  type: RuleAssetType;
  status: RuleAssetStatus;
  fileUrl: string;
  relativePath: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  aiDescription: string | null;
  extractedText: string | null;
  ragEnabled: boolean;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RuleAssetChunkRecord = {
  ruleAssetChunkId: string;
  ruleAssetId: string;
  chunkIndex: number;
  text: string;
  embedding: unknown;
  createdAt: Date;
};

export interface IRuleAssetRepository {
  findById(
    ruleAssetId: string,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord | null>;
  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord[]>;
  create(data: Prisma.RuleAssetCreateInput): Promise<RuleAssetRecord>;
  updateById(
    ruleAssetId: string,
    data: Prisma.RuleAssetUpdateInput,
    auth?: TenancyAuth,
  ): Promise<RuleAssetRecord | null>;
  deleteById(ruleAssetId: string, auth?: TenancyAuth): Promise<boolean>;
  createChunks(
    ruleAssetId: string,
    chunks: { chunkIndex: number; text: string; embedding: unknown }[],
  ): Promise<RuleAssetChunkRecord[]>;
  findChunksByRuleId(ruleId: string): Promise<RuleAssetChunkRecord[]>;
}
