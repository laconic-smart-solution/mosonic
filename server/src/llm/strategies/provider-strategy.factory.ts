import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import { AnthropicProviderStrategy } from './anthropic-provider.strategy';
import { GeminiProviderStrategy } from './gemini-provider.strategy';
import { GroqProviderStrategy } from './groq-provider.strategy';
import { OllamaProviderStrategy } from './ollama-provider.strategy';
import { OpenAiProviderStrategy } from './openai-provider.strategy';
import { resolveModelContextLimit } from './model-context-limits';
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
    private readonly anthropicStrategy: AnthropicProviderStrategy = new AnthropicProviderStrategy(
      config,
    ),
    private readonly groqStrategy: GroqProviderStrategy = new GroqProviderStrategy(
      config,
    ),
    private readonly ollamaStrategy: OllamaProviderStrategy = new OllamaProviderStrategy(
      config,
    ),
  ) {
    this.strategies = new Map<LlmProvider, AiProviderStrategy>([
      [LlmProvider.OpenAI, this.openAiStrategy],
      [LlmProvider.Google, this.geminiStrategy],
      [LlmProvider.Anthropic, this.anthropicStrategy],
      [LlmProvider.Groq, this.groqStrategy],
      [LlmProvider.Ollama, this.ollamaStrategy],
    ]);
  }

  getOpenAiStrategy(): OpenAiProviderStrategy {
    return this.openAiStrategy;
  }

  getGeminiStrategy(): GeminiProviderStrategy {
    return this.geminiStrategy;
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

  getProviderCapabilities(provider?: string): Record<LlmCapability, boolean> {
    const resolved = this.resolveProvider(provider);
    const strategy = this.strategies.get(resolved);
    if (!strategy) {
      throw new Error(`Provider "${resolved}" is not recognized`);
    }
    return strategy.capabilities;
  }

  assertProviderCapability(
    provider: string | undefined,
    capability: LlmCapability,
  ): void {
    const resolved = this.resolveProvider(provider);
    const capabilities = this.getProviderCapabilities(resolved);
    if (!capabilities[capability]) {
      throw new Error(
        `Provider "${resolved}" does not support ${capability.replace('_', ' ')}`,
      );
    }
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

  getContextLimit(model?: string): number {
    const resolved =
      model?.trim() ||
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      this.openAiStrategy.getDefaultModel('chat');
    return resolveModelContextLimit(resolved);
  }
}
