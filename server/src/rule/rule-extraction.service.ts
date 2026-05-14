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
    contentMapping: {
      caption: 'text' | 'translatedText' | 'summary';
      media: 'image' | 'video' | null;
    };
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
          '(Exception: channel contentMapping.media may be null for text-only channels.)',
          '',
          'caption is one of: text | translatedText | summary:',
          '- text → English-forward primary copy;',
          '- translatedText → non-English / localized audiences;',
          '- summary → concise professional copy (LinkedIn-style).',
          'media is one of: image | video | null:',
          '- image → attach image asset when publishing;',
          '- video → attach video when workflow can produce video;',
          '- null → text-only posts.',
          '',
          'contentMapping decision hints (adapt to input):',
          '- instagram: prefer translatedText if targetLanguages imply non-English, else text; media usually image.',
          '- facebook: text or translatedText per audience; media often video when video campaigns exist.',
          '- linkedin: prefer summary; media often null.',
          '- twitter/x: concise summary-like caption; optional image;',
          '- Use media "video" only when the brief implies video-heavy delivery.',
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
                  channel:
                    'facebook | instagram | twitter | linkedin | youtube | tiktok',
                  priority: 'high | medium | low',
                  contentStyle: 'string',
                  contentMapping: {
                    caption: 'text | translatedText | summary',
                    media: 'image | video | null',
                  },
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
    const channels = Array.isArray(parsed.channels)
      ? parsed.channels.map((ch) => normalizeExtractedChannel(ch))
      : [];
    return {
      ...parsed,
      channels,
      status: 'active' as RuleStatus,
    };
  }
}

const CAPTIONS = new Set(['text', 'translatedText', 'summary']);

function normalizeExtractedChannel(
  ch: ExtractedRuleDraft['channels'][0] & Record<string, unknown>,
): ExtractedRuleDraft['channels'][0] {
  const caption = CAPTIONS.has(String(ch.contentMapping?.caption))
    ? (ch.contentMapping?.caption as 'text' | 'translatedText' | 'summary')
    : 'text';
  const rawMedia = ch.contentMapping?.media;
  const media: 'image' | 'video' | null =
    rawMedia === 'image' || rawMedia === 'video' ? rawMedia : null;

  const base = ch as Omit<ExtractedRuleDraft['channels'][0], 'contentMapping'>;

  return {
    ...base,
    contentMapping: {
      caption,
      media,
    },
  };
}
