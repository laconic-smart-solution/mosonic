const mockGenerateContent = jest.fn();
const mockGenerateImages = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
      generateImages: mockGenerateImages,
    },
  })),
}));

import { ConfigService } from '@nestjs/config';
import { GeminiProviderStrategy } from './gemini-provider.strategy';

describe('GeminiProviderStrategy', () => {
  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        GOOGLE_API_KEY: 'AIza-test-key',
      };
      return map[key];
    }),
  } as unknown as ConfigService;

  let strategy: GeminiProviderStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new GeminiProviderStrategy(config);
  });

  it('creates ChatGoogleGenerativeAI honoring requested model', () => {
    const model = strategy.createChatModel({
      mode: 'plain',
      model: 'gemini-2.5-pro',
      temperature: 0.4,
      maxTokens: 1000,
    }) as unknown as { model: string; temperature: number; maxOutputTokens?: number };

    expect(model.model).toBe('gemini-2.5-pro');
    expect(model.temperature).toBe(0.4);
    expect(model.maxOutputTokens).toBe(1000);
  });

  it('generates image via Gemini native image model using generateContent', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: 'YmFzZTY0LWltYWdl',
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
    });

    const out = await strategy.generateImageBase64({
      model: 'gemini-2.5-flash-image',
      prompt: 'A minimalist coffee cup on marble',
      size: '1024x1536',
      aspectRatio: '9:16',
      quality: 'standard',
      style: 'natural',
    });

    expect(out).toEqual({
      base64: 'YmFzZTY0LWltYWdl',
      mimeType: 'image/png',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash-image',
        config: expect.objectContaining({
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '9:16' },
        }),
      }),
    );
  });

  it('generates image via Imagen model using generateImages', async () => {
    mockGenerateImages.mockResolvedValue({
      generatedImages: [
        {
          image: {
            imageBytes: 'aW1hZ2VuLWJ5dGVz',
            mimeType: 'image/png',
          },
        },
      ],
    });

    const out = await strategy.generateImageBase64({
      model: 'imagen-3.0-generate-002',
      prompt: 'Product studio shot',
      size: '1024x1024',
      aspectRatio: '1:1',
      quality: 'standard',
      style: 'natural',
    });

    expect(out).toEqual({
      base64: 'aW1hZ2VuLWJ5dGVz',
      mimeType: 'image/png',
    });
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'imagen-3.0-generate-002',
      }),
    );
  });

  it('transcribes audio buffer via Gemini multimodal generateContent', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Welcome to Mosonic.',
    });

    const text = await strategy.transcribeMedia({
      fileBuffer: Buffer.from('fake-audio'),
      fileName: 'clip.mp3',
      mimeType: 'audio/mpeg',
      model: 'gemini-2.5-flash',
      language: 'en',
    });

    expect(text).toBe('Welcome to Mosonic.');
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
      }),
    );
  });

  it('runs web search brief using Google Search grounding tool and maps usage', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Latest market trends brief.',
      usageMetadata: {
        promptTokenCount: 120,
        candidatesTokenCount: 280,
      },
    });

    const res = await strategy.runWebSearchBrief({
      prompt: 'Find 2026 coffee trends',
      model: 'gemini-2.5-flash',
    });

    expect(res).toEqual({
      text: 'Latest market trends brief.',
      usage: { inputTokens: 120, outputTokens: 280 },
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        config: { tools: [{ googleSearch: {} }] },
      }),
    );
  });
});
