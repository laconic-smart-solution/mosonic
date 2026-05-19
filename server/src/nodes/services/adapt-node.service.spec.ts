import { UnprocessableEntityException } from '@nestjs/common';
import { AdaptNodeService } from './adapt-node.service';
import { CaptionMappingSource } from '../../rule/schemas/rule.schema';

describe('AdaptNodeService', () => {
  const invoke = jest.fn();
  const llm = {
    getChatModelForPlainText: jest.fn(() => ({ invoke })),
  };
  const service = new AdaptNodeService(llm as never);

  const rule = {
    brand: {
      brandName: 'Acme',
      brandTone: ['friendly'],
      callToAction: 'Shop now',
    },
    channels: [
      {
        channel: 'instagram',
        priority: 'high',
        contentStyle: 'short visual captions',
        contentMapping: {
          caption: CaptionMappingSource.Text,
          media: null,
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    invoke.mockResolvedValue({
      content: 'IG adapted caption',
      response_metadata: {},
    });
  });

  it('throws when channel config is missing', async () => {
    await expect(
      service.execute({
        rule: rule as never,
        config: {},
        contentPrompt: 'brief',
        previousOutputs: { text: 'base' },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('includes channel contentStyle in LLM prompt and returns adapt output shape', async () => {
    const result = await service.execute({
      rule: rule as never,
      config: { channel: 'instagram', model: 'gpt-4o' },
      contentPrompt: 'Summer sale',
      previousOutputs: { text: 'Base marketing copy' },
    });

    const systemMsg = invoke.mock.calls[0][0][0];
    expect(String(systemMsg.content)).toContain('short visual captions');
    expect(String(systemMsg.content)).toContain('instagram');

    const parsed = JSON.parse(result.output) as Record<string, string>;
    expect(parsed.text).toBe('IG adapted caption');
    expect(parsed.adaptedCaption).toBe('IG adapted caption');
    expect(parsed.channel).toBe('instagram');
  });
});
