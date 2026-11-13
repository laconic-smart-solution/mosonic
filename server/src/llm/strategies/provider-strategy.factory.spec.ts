import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import { AnthropicProviderStrategy } from './anthropic-provider.strategy';
import { GeminiProviderStrategy } from './gemini-provider.strategy';
import { GroqProviderStrategy } from './groq-provider.strategy';
import { OllamaProviderStrategy } from './ollama-provider.strategy';
import { OpenAiProviderStrategy } from './openai-provider.strategy';
import { ProviderStrategyFactory } from './provider-strategy.factory';

describe('ProviderStrategyFactory', () => {
  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        GOOGLE_API_KEY: 'AIza-test',
        ANTHROPIC_API_KEY: 'ant-test',
        GROQ_API_KEY: 'gsk-test',
      };
      return map[key];
    }),
  } as unknown as ConfigService;

  let factory: ProviderStrategyFactory;

  beforeEach(() => {
    factory = new ProviderStrategyFactory(config);
  });

  it('returns OpenAiProviderStrategy when requested=openai', () => {
    const strategy = factory.requireStrategy('openai', 'chat');
    expect(strategy).toBeInstanceOf(OpenAiProviderStrategy);
    expect(strategy.provider).toBe(LlmProvider.OpenAI);
  });

  it('returns GeminiProviderStrategy when requested=google for image_generation and transcription', () => {
    const imgStrategy = factory.requireStrategy('google', 'image_generation');
    expect(imgStrategy).toBeInstanceOf(GeminiProviderStrategy);
    expect(imgStrategy.provider).toBe(LlmProvider.Google);

    const txStrategy = factory.requireStrategy('google', 'transcription');
    expect(txStrategy).toBeInstanceOf(GeminiProviderStrategy);
  });

  it('returns AnthropicProviderStrategy, GroqProviderStrategy, and OllamaProviderStrategy', () => {
    const anthropic = factory.requireStrategy('anthropic', 'chat');
    expect(anthropic).toBeInstanceOf(AnthropicProviderStrategy);

    const groq = factory.requireStrategy('groq', 'chat');
    expect(groq).toBeInstanceOf(GroqProviderStrategy);

    const ollama = factory.requireStrategy('ollama', 'chat');
    expect(ollama).toBeInstanceOf(OllamaProviderStrategy);
  });

  it('rejects unsupported capability on Gemini (video_generation)', () => {
    expect(() =>
      factory.requireStrategy('google', 'video_generation'),
    ).toThrow('Provider "google" does not support video generation');
  });

  it('returns provider-appropriate default models', () => {
    expect(factory.getDefaultModel('openai', 'chat')).toBe('gpt-4o');
    expect(factory.getDefaultModel('openai', 'image_generation')).toBe(
      'gpt-image-2',
    );
    expect(factory.getDefaultModel('openai', 'transcription')).toBe(
      'whisper-1',
    );

    expect(factory.getDefaultModel('google', 'chat')).toBe('gemini-2.5-flash');
    expect(factory.getDefaultModel('google', 'image_generation')).toBe(
      'gemini-2.5-flash-image',
    );
    expect(factory.getDefaultModel('google', 'transcription')).toBe(
      'gemini-2.5-flash',
    );

    expect(factory.getDefaultModel('anthropic', 'chat')).toBe(
      'claude-3-5-sonnet-latest',
    );
    expect(factory.getDefaultModel('groq', 'chat')).toBe(
      'llama-3.3-70b-versatile',
    );
    expect(factory.getDefaultModel('groq', 'transcription')).toBe(
      'whisper-large-v3-turbo',
    );
    expect(factory.getDefaultModel('ollama', 'chat')).toBe('llama3.1');
  });
});
