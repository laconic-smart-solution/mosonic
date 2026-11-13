import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import { GeminiProviderStrategy } from './gemini-provider.strategy';
import { OpenAiProviderStrategy } from './openai-provider.strategy';
import type {
  AiProviderStrategy,
  LlmCapability,
} from './provider-strategy.interface';

@Injectable()
export class ProviderStrategyFactory {
  private readonly strategies: Map<LlmProvider, AiProviderStrategy>;

  constructor(
    private readonly config: ConfigService,
    private readonly openAiStrategy: OpenAiProviderStrategy = new OpenAiProviderStrategy(
      config,
    ),
    private readonly geminiStrategy: GeminiProviderStrategy = new GeminiProviderStrategy(
      config,
    ),
  ) {
    this.strategies = new Map<LlmProvider, AiProviderStrategy>([
      [LlmProvider.OpenAI, this.openAiStrategy],
      [LlmProvider.Google, this.geminiStrategy],
    ]);
  }

  resolveProvider(requested?: string): LlmProvider {
    const normalized = requested?.trim().toLowerCase();
    if (
      normalized &&
      (Object.values(LlmProvider) as string[]).includes(normalized)
    ) {
      return normalized as LlmProvider;
    }
    const fromEnv = this.config
      .get<string>('LLM_PROVIDER')
      ?.trim()
      .toLowerCase();
    if (fromEnv && (Object.values(LlmProvider) as string[]).includes(fromEnv)) {
      return fromEnv as LlmProvider;
    }
    return LlmProvider.OpenAI;
  }

  getStrategy(provider: LlmProvider): AiProviderStrategy | undefined {
    return this.strategies.get(provider);
  }

  requireStrategy(
    requestedProvider: string | undefined,
    capability: LlmCapability,
  ): AiProviderStrategy {
    const provider = this.resolveProvider(requestedProvider);
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new Error(
        `Provider "${provider}" does not support ${capability.replace('_', ' ')}`,
      );
    }
    if (!strategy.capabilities[capability]) {
      throw new Error(
        `Provider "${provider}" does not support ${capability.replace('_', ' ')}`,
      );
    }
    return strategy;
  }

  getDefaultModel(
    requestedProvider: string | undefined,
    capability: LlmCapability,
  ): string {
    const provider = this.resolveProvider(requestedProvider);
    const strategy = this.strategies.get(provider);
    if (strategy) {
      return strategy.getDefaultModel(capability);
    }
    return this.openAiStrategy.getDefaultModel(capability);
  }
}
