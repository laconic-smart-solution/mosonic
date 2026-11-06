import {
  detectExplicitUserFormatting,
  TextGenerationService,
} from './text-generation.service';
import { Rule } from '../../rule/schemas/rule.schema';
import { NodeOutputFormat, NodeSummaryLength, NodeTextTone } from '../schemas/workflow-node.schema';

describe('TextGenerationService - Prompt De-confliction & User Formatting', () => {
  describe('detectExplicitUserFormatting', () => {
    it('detects numbered list items as explicit formatting', () => {
      const prompt = `1. Main headline\n2. Product introduction\n3. Features and benefits\n4. Call to Action`;
      expect(detectExplicitUserFormatting(prompt)).toBe(true);
    });

    it('detects bullet symbols, emojis, and bracketed tags as explicit formatting', () => {
      const prompt = `**🏎️ MAIN HEADLINE**\n✨ Key feature 1\n✨ Key feature 2\n**🛒 [Call to Action – Shop Now!]**\n#Brand #Sale`;
      expect(detectExplicitUserFormatting(prompt)).toBe(true);
    });

    it('detects markdown headers as explicit formatting', () => {
      const prompt = `### Hook\n## Core Insight\n### Conclusion`;
      expect(detectExplicitUserFormatting(prompt)).toBe(true);
    });

    it('detects template/format keywords as explicit formatting', () => {
      const prompt = `Use this format:\nHeadline:\nIntro:\nCTA:`;
      expect(detectExplicitUserFormatting(prompt)).toBe(true);
    });

    it('returns false for standard free-form plain text requests', () => {
      const prompt = `Write a nice promotional post for our new summer running shoe launch.`;
      expect(detectExplicitUserFormatting(prompt)).toBe(false);
    });

    it('returns false for empty or null prompt', () => {
      expect(detectExplicitUserFormatting('')).toBe(false);
      expect(detectExplicitUserFormatting(undefined)).toBe(false);
    });
  });

  describe('Prompt de-confliction in generateText', () => {
    let service: TextGenerationService;
    let mockLlm: any;
    let mockRule: Rule;

    beforeEach(() => {
      mockLlm = {
        getChatModelForPlainText: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({
            content: '🏎️ Headline\n✨ Feature 1\n🛒 Shop Now',
          }),
        }),
        getChatModelForStructuredOutput: jest.fn(),
      };
      service = new TextGenerationService(mockLlm);
      mockRule = {
        brand: {
          brandName: 'TestBrand',
          industry: 'Footwear',
          brandDescription: 'High quality shoes',
          brandTone: ['Inspiring'],
          brandVoice: 'Active',
          callToAction: 'Shop now',
          brandRestrictions: ['No false claims'],
        },
        audience: {
          description: 'Runners',
          ageRange: { min: 20, max: 40 },
          location: ['Global'],
          language: 'en',
          interests: ['Running'],
          painPoints: ['Foot fatigue'],
        },
        campaign: {
          goals: ['Sales'],
          keywords: ['Speed', 'Comfort'],
          hashtagStrategy: ['#Running'],
        },
        contentGuidelines: {
          dos: ['Be positive'],
          donts: ['No slang'],
          requiredElements: ['Logo'],
          seoGuidelines: { primaryKeywords: ['running shoes'] },
        },
      } as any;
    });

    it('suppresses "Write in flowing paragraph form" when structured template is provided', async () => {
      const structuredPrompt = `**🏎️ MAIN HEADLINE**\n✨ [Key feature 1]\n✨ [Key feature 2]\n**🛒 [Call to Action – Shop Now!]**`;

      await service.generateText({
        rule: mockRule,
        contentPrompt: structuredPrompt,
        config: {
          outputFormat: NodeOutputFormat.Paragraph,
          tone: NodeTextTone.Professional,
          textLength: NodeSummaryLength.Medium,
        },
      });

      expect(mockLlm.getChatModelForPlainText).toHaveBeenCalled();
      const invokeMock = mockLlm.getChatModelForPlainText().invoke;
      expect(invokeMock).toHaveBeenCalled();
      const messages = invokeMock.mock.calls[0][0];
      const systemMessageContent = messages[0].content as string;

      expect(systemMessageContent).toContain('=== OUTPUT FORMAT & USER LAYOUT CONTRACT ===');
      expect(systemMessageContent).toContain('You MUST follow the user-provided structure');
      expect(systemMessageContent).not.toContain('Write in flowing paragraph form.');
    });

    it('preserves "Write in flowing paragraph form" for plain free-form requests', async () => {
      const plainPrompt = `Write a nice general announcement for our new cafe opening.`;

      await service.generateText({
        rule: mockRule,
        contentPrompt: plainPrompt,
        config: {
          outputFormat: NodeOutputFormat.Paragraph,
          tone: NodeTextTone.Professional,
          textLength: NodeSummaryLength.Medium,
        },
      });

      expect(mockLlm.getChatModelForPlainText).toHaveBeenCalled();
      const invokeMock = mockLlm.getChatModelForPlainText().invoke;
      const messages = invokeMock.mock.calls[0][0];
      const systemMessageContent = messages[0].content as string;

      expect(systemMessageContent).toContain('=== OUTPUT FORMAT ===');
      expect(systemMessageContent).toContain('Write in flowing paragraph form.');
      expect(systemMessageContent).not.toContain('=== OUTPUT FORMAT & USER LAYOUT CONTRACT ===');
    });
  });

  describe('Structured Content Generation Engine & Repair', () => {
    let mockLlm: any;
    let mockRule: any;
    let service: TextGenerationService;

    beforeEach(() => {
      mockLlm = {
        getChatModelForPlainText: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({
            content: 'Plain fallback text',
          }),
        }),
        getChatModelForStructuredOutput: jest.fn(),
      };
      service = new TextGenerationService(mockLlm);
      mockRule = {
        brand: {
          brandName: 'Apex Audio',
          industry: 'Consumer Tech',
          brandDescription: 'Premium wireless earbuds',
          brandTone: ['innovative', 'bold'],
          brandVoice: 'direct and inspiring',
          callToAction: 'Shop now at apexaudio.com',
          brandRestrictions: ['No false claims'],
        },
        audience: {
          description: 'Audiophiles',
          ageRange: { min: 20, max: 45 },
          location: ['Global'],
          language: 'English',
          interests: ['Music', 'Gadgets'],
          painPoints: ['Poor battery'],
        },
        campaign: {
          goals: ['Product Launch'],
          keywords: ['earbuds', 'wireless'],
          hashtagStrategy: ['#ApexAudio', '#WirelessAudio'],
        },
        contentGuidelines: {
          dos: ['Highlight sound quality'],
          donts: ['No cheap comparisons'],
          requiredElements: ['Logo'],
          seoGuidelines: { primaryKeywords: ['wireless earbuds'] },
        },
      };
    });

    it('generates structured sections and compiles Markdown when template matches', async () => {
      const structuredPrompt = `Template: 7-part Instagram launch
1. Main Headline
2. Product Introduction
3. 4 Key Features
4. Special Promotion
5. Persuasion
6. Call to Action
7. Hashtags`;

      const mockStructuredOutput = {
        headline: 'Next-Gen Sound is Here: Meet Apex Pro',
        introduction: 'Immerse yourself in studio-grade acoustics designed for true audiophiles.',
        features: ['Active Noise Cancellation up to 40dB', '48-Hour combined battery life', 'Custom 12mm graphene drivers', 'IPX7 sweatproof design'],
        promotion: 'Get 20% off during our launch weekend with code APEXLAUNCH.',
        persuasion: 'Don\'t settle for ordinary audio when you can experience true high-fidelity.',
        cta: 'Click the link in bio to order yours today.',
        hashtags: ['#ApexAudio', '#ApexPro', '#Audiophile', '#WirelessEarbuds'],
      };

      mockLlm.getChatModelForStructuredOutput.mockReturnValue({
        invoke: jest.fn().mockResolvedValue(mockStructuredOutput),
      });

      const result = await service.generateText({
        rule: mockRule,
        contentPrompt: structuredPrompt,
        config: {
          outputFormat: NodeOutputFormat.Paragraph,
          tone: NodeTextTone.Professional,
          textLength: NodeSummaryLength.Medium,
        },
      });

      expect(mockLlm.getChatModelForStructuredOutput).toHaveBeenCalled();
      expect(result.sections).toBeDefined();
      expect(result.sections?.length).toBeGreaterThanOrEqual(6);
      expect(result.text).toContain('Next-Gen Sound is Here: Meet Apex Pro');
      expect(result.text).toContain('Active Noise Cancellation');
      expect(result.text).toContain('#ApexAudio');
    });

    it('executes bounded repair turn when required section is missing in first turn', async () => {
      const structuredPrompt = `Use this template:
1. Headline
2. Introduction
3. Features
4. CTA`;

      // Turn 1 returns missing headline and empty features
      const turn1Output = {
        headline: '',
        introduction: 'Great intro',
        features: [],
        cta: 'Buy now',
      };

      // Turn 2 repairs the missing fields
      const turn2Output = {
        headline: 'Repaired Epic Headline',
        introduction: 'Great intro',
        features: ['Feature 1', 'Feature 2'],
        cta: 'Buy now',
      };

      const invokeMock = jest
        .fn()
        .mockResolvedValueOnce(turn1Output)
        .mockResolvedValueOnce(turn2Output);

      mockLlm.getChatModelForStructuredOutput.mockReturnValue({
        invoke: invokeMock,
      });

      const result = await service.generateText({
        rule: mockRule,
        contentPrompt: structuredPrompt,
        config: {
          outputFormat: NodeOutputFormat.Paragraph,
          tone: NodeTextTone.Professional,
          textLength: NodeSummaryLength.Medium,
        },
      });

      // Assert that 2 turns were invoked (initial + 1 repair turn)
      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(result.sections?.find((s) => s.key === 'headline')?.content).toBe('Repaired Epic Headline');
      expect(result.text).toContain('Repaired Epic Headline');
    });
  });
});
