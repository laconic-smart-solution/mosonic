import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import type { RuleStatus } from './schemas/rule.schema';

export interface ExtractedRuleDraft {
  name: string;
  brand: {
    brandName: string;
    industry: string;
    brandDescription: string;
    brandTone: string[];
    brandVoice: string;
    brandRestrictions: string[];
    callToAction: string;
  };
  audience: {
    description: string;
    ageRange: { min: number; max: number };
    gender: 'all' | 'male' | 'female';
    location: string[];
    interests: string[];
    painPoints: string[];
    language: string;
    targetLanguages: string[];
  };
  campaign: {
    goals: string[];
    keywords: string[];
    hashtagStrategy: string[];
    contentFormats: string[];
    duration: { startDate: string; endDate: string };
    postingFrequency: 'daily' | 'weekly' | 'custom';
    customSchedule: string[];
  };
  channels: Array<{
    channel: string;
    priority: 'high' | 'medium' | 'low';
    contentStyle: string;
  }>;
  contentGuidelines: {
    dos: string[];
    donts: string[];
    requiredElements: string[];
    seoGuidelines: {
      primaryKeywords: string[];
      secondaryKeywords: string[];
      keywordDensity: string;
    };
  };
  status: RuleStatus;
}

@Injectable()
export class RuleExtractionService {
  constructor(private readonly llm: LlmService) {}

  async extractRuleFromInput(rawInput: string): Promise<ExtractedRuleDraft> {
    const model = this.llm.getChatModel();
    const res = await model.invoke([
      [
        'system',
        [
          'You are a marketing strategy extraction engine.',
          'Extract the brand strategy from the user input and return it as a single valid JSON object.',
          'Output must be strictly valid JSON with no markdown, no code fences, no comments, no explanation.',
          'If a value is not found in the input, use a sensible realistic default — never return null or empty strings.',
          '',
          'Return exactly this JSON structure:',
          JSON.stringify(
            {
              name: 'campaign name inferred from input',
              brand: {
                brandName: 'string',
                industry: 'string',
                brandDescription: 'string',
                brandTone: ['string'],
                brandVoice: 'string',
                brandRestrictions: ['string'],
                callToAction: 'string',
              },
              audience: {
                description: 'string',
                ageRange: { min: 0, max: 0 },
                gender: 'all | male | female',
                location: ['string'],
                interests: ['string'],
                painPoints: ['string'],
                language: 'string',
                targetLanguages: ['string'],
              },
              campaign: {
                goals: ['string'],
                keywords: ['string'],
                hashtagStrategy: ['string'],
                contentFormats: ['string'],
                duration: {
                  startDate: 'YYYY-MM-DD',
                  endDate: 'YYYY-MM-DD',
                },
                postingFrequency: 'daily | weekly | custom',
                customSchedule: [
                  'monday | tuesday | wednesday | thursday | friday | saturday | sunday',
                ],
              },
              channels: [
                {
                  channel: 'facebook | instagram | twitter | linkedin',
                  priority: 'high | medium | low',
                  contentStyle: 'string',
                },
              ],
              contentGuidelines: {
                dos: ['string'],
                donts: ['string'],
                requiredElements: ['string'],
                seoGuidelines: {
                  primaryKeywords: ['string'],
                  secondaryKeywords: ['string'],
                  keywordDensity: 'string',
                },
              },
            },
            null,
            2,
          ),
        ].join('\n'),
      ],
      ['human', rawInput],
    ]);

    const text =
      typeof res.content === 'string'
        ? res.content
        : JSON.stringify(res.content ?? {});
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Omit<ExtractedRuleDraft, 'status'>;
    return {
      ...parsed,
      status: 'active' as RuleStatus,
    };
  }
}
