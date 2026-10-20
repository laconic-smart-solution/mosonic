import { TextGenerationService } from './text-generation.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('TextGenerationService sourcePack notes', () => {
  const rule = {
    ruleId: 'r1',
    brand: {
      brandName: 'Mosonic',
      industry: 'SaaS',
      brandTone: ['friendly'],
      brandVoice: 'clear',
      callToAction: 'Try now',
      brandRestrictions: [],
    },
    audience: {
      description: 'SMEs',
      language: 'en',
      location: ['TH'],
      interests: [],
      painPoints: [],
      ageRange: { min: 25, max: 45 },
    },
    campaign: { goals: [], keywords: [], hashtagStrategy: [] },
    contentGuidelines: {
      dos: [],
      donts: [],
      requiredElements: [],
      seoGuidelines: { primaryKeywords: [] },
    },
    channels: [],
  } as unknown as Rule;

  it('includes sourcePack notes in the human prompt', async () => {
    let humanText = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: jest.fn(async (messages: unknown[]) => {
          const human = messages[1] as { content: string };
          humanText = human.content;
          return { content: 'Generated copy' };
        }),
      }),
    };

    const svc = new TextGenerationService(llm as never);
    await svc.generateText({
      rule,
      contentPrompt: 'Announce a launch',
      config: {},
      sourcePackNotes: 'Product: Blue bottle. Claim: 50% off.',
    });

    expect(humanText).toContain('Source attachments for this run');
    expect(humanText).toContain('Product: Blue bottle');
    expect(humanText).toContain('Announce a launch');
  });
});
