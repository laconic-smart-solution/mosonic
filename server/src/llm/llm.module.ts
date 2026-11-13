import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GeminiProviderStrategy } from './strategies/gemini-provider.strategy';
import { OpenAiProviderStrategy } from './strategies/openai-provider.strategy';
import { ProviderStrategyFactory } from './strategies/provider-strategy.factory';

@Module({
  providers: [
    OpenAiProviderStrategy,
    GeminiProviderStrategy,
    ProviderStrategyFactory,
    LlmService,
  ],
  exports: [LlmService, ProviderStrategyFactory],
})
export class LlmModule {}
