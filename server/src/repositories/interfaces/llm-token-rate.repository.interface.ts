import type { LlmTokenRate } from '@prisma/client';

export type LlmTokenRateRecord = LlmTokenRate;

export interface ILlmTokenRateRepository {
  listAll(): Promise<LlmTokenRateRecord[]>;
  findActiveByProviderModel(
    provider: string,
    model: string,
  ): Promise<LlmTokenRateRecord | null>;
  findByProviderModel(
    provider: string,
    model: string,
  ): Promise<LlmTokenRateRecord | null>;
  upsertByProviderModel(data: {
    provider: string;
    model: string;
    inputPerMToken: number;
    outputPerMToken: number;
    reasoningPerMToken?: number | null;
  }): Promise<LlmTokenRateRecord>;
}
