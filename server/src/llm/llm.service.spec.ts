import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';
import {
  LlmProvider,
  WorkflowNodeType,
} from '../nodes/workflow-node-llm.enums';

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

  it('rejects invalid explicit image size for gpt-image-2 (schema)', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
        model: 'gpt-image-2',
        size: '1792x1024',
      }),
    ).toThrow('Invalid image size');
  });

  it('resolves chat provider from env by default', () => {
    expect(() => service.getChatModelForPlainText()).not.toThrow();
  });

  it('builds a reasoning model without throwing, and omits temperature', () => {
    const chatModel = service.getReasoningChatModel();
    expect(chatModel).toBeDefined();
    // ChatOpenAI stores constructor options on the instance; temperature must
    // never be set for reasoning models (the API rejects it).
    expect((chatModel as unknown as { temperature?: number }).temperature).toBeUndefined();
  });

  it('defaults the reasoning model id to gpt-6-luna when unset', () => {
    expect(service.getReasoningModelId()).toBe('gpt-6-luna');
  });

  it('uses OPENAI_REASONING_MODEL when configured', () => {
    const customConfig = {
      get: jest.fn((key: string) =>
        key === 'OPENAI_REASONING_MODEL' ? 'o3' : config.get(key),
      ),
    } as unknown as ConfigService;
    const customService = new LlmService(customConfig);
    expect(customService.getReasoningModelId()).toBe('o3');
  });

  it('returns a context limit for the reasoning model id', () => {
    expect(service.getContextLimit(service.getReasoningModelId())).toBe(1_050_000);
  });

  it('builds the reasoning model on the Responses API with low effort', () => {
    const chatModel = service.getReasoningChatModel();
    const fields = chatModel as unknown as {
      reasoning?: { effort?: string };
      useResponsesApi?: boolean;
    };
    expect(fields.reasoning?.effort).toBe('low');
    expect(fields.useResponsesApi).toBe(true);
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

  it('allows google provider for image generation and transcription', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
        provider: LlmProvider.Google,
      }),
    ).not.toThrow();
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.Transcription, {
        provider: LlmProvider.Google,
      }),
    ).not.toThrow();
  });

  it('forwards explicit model option for google and openai chat models', () => {
    const googleChat = service.getChatModelForPlainText({
      provider: LlmProvider.Google,
      model: 'gemini-2.5-pro',
    }) as unknown as { model?: string };
    expect(googleChat.model).toBe('gemini-2.5-pro');

    const openaiChat = service.getChatModelForPlainText({
      provider: LlmProvider.OpenAI,
      model: 'gpt-4.1',
    }) as unknown as { model?: string };
    expect(openaiChat.model).toBe('gpt-4.1');
  });

  it('rejects non-openai provider for video generation', () => {
    expect(() =>
      service.validateWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
        provider: LlmProvider.Google,
      }),
    ).toThrow('does not support video generation');
  });

  it('stores an absolute file URL when the file service returns "4001/api/..." (I-10)', async () => {
    const fileConfig = {
      get: jest.fn((key: string) =>
        key === 'FILE_SERVICE_URL' ? 'https://files.test-host.io/api/file/v1' : undefined,
      ),
    } as unknown as ConfigService;
    const fileService = new LlmService(fileConfig);
    const relativePath = 'testing/neural-tex/workflow-images/wf/x.png';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 201,
      json: async () => ({
        success: true,
        data: {
          fileUrl: `4001/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
          relativePath,
        },
      }),
    } as unknown as Response);
    try {
      const uploaded = await fileService.uploadImageBase64({
        base64: Buffer.from('png').toString('base64'),
        mimeType: 'image/png',
        fileName: 'x.png',
      });
      expect(uploaded.fileUrl).toBe(
        `https://files.test-host.io/api/file/v1/file?relativePath=${encodeURIComponent(relativePath)}`,
      );
      expect(uploaded.relativePath).toBe(relativePath);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

