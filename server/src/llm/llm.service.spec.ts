import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import { LlmProvider, WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';

describe('LlmService', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-openai-key',
        OPENAI_MODEL: 'gpt-4o-mini',
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        ANTHROPIC_MODEL: 'claude-3-5-sonnet-latest',
        GOOGLE_API_KEY: 'test-google-key',
        GOOGLE_MODEL: 'gemini-1.5-pro',
        GROQ_API_KEY: 'test-groq-key',
        GROQ_MODEL: 'llama-3.3-70b-versatile',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  let service: LlmService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LlmService(config);
  });

  it('resolves chat provider from env by default', () => {
    expect(() => service.getChatModelForPlainText()).not.toThrow();
  });

  it('rejects unsupported provider capability for image generation', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
        provider: LlmProvider.Anthropic,
      }),
    ).toThrow('does not support image generation');
  });

  it('allows groq provider for transcription', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.Transcription, {
        provider: LlmProvider.Groq,
      }),
    ).not.toThrow();
  });

  it('rejects non-openai provider for video generation', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
        provider: LlmProvider.Google,
      }),
    ).toThrow('does not support video generation');
  });
});
