import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { ILlmTokenRateRepository } from '../interfaces/llm-token-rate.repository.interface';
import type { LlmTokenRateRecord } from '../interfaces/llm-token-rate.repository.interface';

@Injectable()
export class PrismaLlmTokenRateRepository implements ILlmTokenRateRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAll(): Promise<LlmTokenRateRecord[]> {
    return this.prisma.llmTokenRate.findMany({
      orderBy: [{ provider: 'asc' }, { model: 'asc' }],
    });
  }

  findActiveByProviderModel(
    provider: string,
    model: string,
  ): Promise<LlmTokenRateRecord | null> {
    return this.prisma.llmTokenRate.findFirst({
      where: { provider, model, isActive: true },
    });
  }

  findByProviderModel(
    provider: string,
    model: string,
  ): Promise<LlmTokenRateRecord | null> {
    return this.prisma.llmTokenRate.findUnique({
      where: { provider_model: { provider, model } },
    });
  }

  upsertByProviderModel(data: {
    provider: string;
    model: string;
    inputPerMToken: number;
    outputPerMToken: number;
    reasoningPerMToken?: number | null;
  }): Promise<LlmTokenRateRecord> {
    return this.prisma.llmTokenRate.upsert({
      where: { provider_model: { provider: data.provider, model: data.model } },
      create: {
        provider: data.provider,
        model: data.model,
        inputPerMToken: data.inputPerMToken,
        outputPerMToken: data.outputPerMToken,
        reasoningPerMToken: data.reasoningPerMToken ?? null,
        isActive: true,
      },
      update: {
        inputPerMToken: data.inputPerMToken,
        outputPerMToken: data.outputPerMToken,
        reasoningPerMToken: data.reasoningPerMToken ?? null,
        isActive: true,
      },
    });
  }
}
