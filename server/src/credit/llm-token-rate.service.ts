import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreditCalculationResult } from './credit-calculation.service';
import { CreditCalculationService } from './credit-calculation.service';
import {
  ADMIN_TOKEN_RATE_SAMPLE,
  rawUsdFromTokens,
} from './lib/llm-token-cost.util';
import {
  defaultRateForModel,
  LLM_TOKEN_RATE_DEFAULTS,
} from './lib/llm-token-rate.defaults';
import { LLM_TOKEN_RATE_REPOSITORY } from '../repositories/tokens';
import type { ILlmTokenRateRepository } from '../repositories/interfaces/llm-token-rate.repository.interface';

export type LlmTokenRateAdminRow = {
  provider: string;
  model: string;
  inputPerMToken: number;
  outputPerMToken: number;
  reasoningPerMToken: number | null;
  isActive: boolean;
  sampleRawUsd: number;
  sampleCredits: number;
  creditPriceUsd: number;
  marginTarget: number;
  overheadFactor: number;
};

@Injectable()
export class LlmTokenRateService {
  constructor(
    @Inject(LLM_TOKEN_RATE_REPOSITORY)
    private readonly rates: ILlmTokenRateRepository,
    private readonly calculation: CreditCalculationService,
  ) {}

  async seedDefaults(): Promise<void> {
    for (const row of LLM_TOKEN_RATE_DEFAULTS) {
      const existing = await this.rates.findByProviderModel(
        row.provider,
        row.model,
      );
      if (existing) continue;
      await this.rates.upsertByProviderModel({
        provider: row.provider,
        model: row.model,
        inputPerMToken: row.inputPerMToken,
        outputPerMToken: row.outputPerMToken,
        reasoningPerMToken: row.reasoningPerMToken ?? null,
      });
    }
  }

  async resolveRate(
    provider: string,
    model: string,
  ): Promise<{
    inputPerMToken: number;
    outputPerMToken: number;
    reasoningPerMToken: number | null;
  } | null> {
    const p = provider.trim().toLowerCase() || 'openai';
    const m = model.trim();
    if (!m) return null;
    const stored = await this.rates.findActiveByProviderModel(p, m);
    if (stored) {
      return {
        inputPerMToken: stored.inputPerMToken,
        outputPerMToken: stored.outputPerMToken,
        reasoningPerMToken: stored.reasoningPerMToken,
      };
    }
    const fallback = defaultRateForModel(p, m);
    if (!fallback) return null;
    return {
      inputPerMToken: fallback.inputPerMToken,
      outputPerMToken: fallback.outputPerMToken,
      reasoningPerMToken: fallback.reasoningPerMToken ?? null,
    };
  }

  async quoteTokens(args: {
    provider?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
  }): Promise<(CreditCalculationResult & { model: string; provider: string }) | null> {
    const provider = (args.provider ?? 'openai').trim().toLowerCase() || 'openai';
    const rate = await this.resolveRate(provider, args.model);
    if (!rate) return null;
    const rawCostUsd = rawUsdFromTokens(
      {
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        reasoningTokens: args.reasoningTokens,
      },
      rate,
    );
    if (rawCostUsd <= 0) return null;
    const calc = await this.calculation.calculateCredits(rawCostUsd);
    return { ...calc, model: args.model.trim(), provider };
  }

  async listForAdmin(): Promise<LlmTokenRateAdminRow[]> {
    await this.seedDefaults();
    const stored = await this.rates.listAll();
    const byKey = new Map(
      stored.map((row) => [`${row.provider}:${row.model}`, row]),
    );
    const config = await this.calculation.getConfig();
    const keys = new Set([
      ...LLM_TOKEN_RATE_DEFAULTS.map((d) => `${d.provider}:${d.model}`),
      ...stored.map((s) => `${s.provider}:${s.model}`),
    ]);

    const rows: LlmTokenRateAdminRow[] = [];
    for (const key of [...keys].sort()) {
      const [provider, model] = key.split(':') as [string, string];
      const def = defaultRateForModel(provider, model);
      const saved = byKey.get(key);
      const inputPerMToken = saved?.inputPerMToken ?? def?.inputPerMToken ?? 0;
      const outputPerMToken =
        saved?.outputPerMToken ?? def?.outputPerMToken ?? 0;
      const reasoningPerMToken =
        saved?.reasoningPerMToken ?? def?.reasoningPerMToken ?? null;
      const sampleRawUsd = rawUsdFromTokens(ADMIN_TOKEN_RATE_SAMPLE, {
        inputPerMToken,
        outputPerMToken,
        reasoningPerMToken,
      });
      const sample = await this.calculation.calculateCredits(sampleRawUsd);
      rows.push({
        provider,
        model,
        inputPerMToken,
        outputPerMToken,
        reasoningPerMToken,
        isActive: saved?.isActive ?? true,
        sampleRawUsd,
        sampleCredits: sample.creditsCharged,
        creditPriceUsd: config.creditPriceUsd,
        marginTarget: config.marginTarget,
        overheadFactor: config.overheadFactor,
      });
    }
    return rows;
  }

  async update(args: {
    provider: string;
    model: string;
    inputPerMToken: number;
    outputPerMToken: number;
    reasoningPerMToken?: number | null;
  }): Promise<LlmTokenRateAdminRow> {
    if (args.inputPerMToken < 0 || args.outputPerMToken < 0) {
      throw new BadRequestException('Token rates must be zero or positive');
    }
    if (
      args.reasoningPerMToken != null &&
      args.reasoningPerMToken < 0
    ) {
      throw new BadRequestException('Reasoning rate must be zero or positive');
    }
    const provider = args.provider.trim().toLowerCase() || 'openai';
    const model = args.model.trim();
    if (!model) throw new BadRequestException('model is required');
    await this.rates.upsertByProviderModel({
      provider,
      model,
      inputPerMToken: args.inputPerMToken,
      outputPerMToken: args.outputPerMToken,
      reasoningPerMToken: args.reasoningPerMToken ?? null,
    });
    const rows = await this.listForAdmin();
    const row = rows.find((r) => r.provider === provider && r.model === model);
    if (!row) throw new BadRequestException('Could not reload token rate');
    return row;
  }
}
