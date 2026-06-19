import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { parseJsonWithFenceOrThrow } from '../common/utils/json-parse.util';
import { extractUsageFromAiMessage } from '../nodes/langchain-usage.util';
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

  async extractRuleFromInput(rawInput: string): Promise<{
    draft: ExtractedRuleDraft;
    usage?: { inputTokens?: number; outputTokens?: number };
  }> {
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
          // ── FIELD DEFINITIONS ──────────────────────────────────────────────
          'FIELD DEFINITIONS',
          '',
          'caption — how to write the post copy:',
          '  text           → primary English copy, conversational, full length allowed',
          '  translatedText → localized copy; use when audience.language is non-English OR targetLanguages contains a non-English code',
          '  summary        → short professional copy; use for LinkedIn or any B2B/professional context',
          '',
          'media — what asset to attach:',
          '  image → attach image; use for visual platforms (instagram, facebook, tiktok, twitter)',
          '  video → attach video; use ONLY when input explicitly mentions video content or a video campaign',
          '  null  → text only; default for linkedin unless input mentions visuals',
          '',
          // ── CHANNEL DECISION TABLE ─────────────────────────────────────────
          'CHANNEL DECISION TABLE (use as defaults, override only if input explicitly states otherwise):',
          '  instagram → caption: translatedText if non-English audience, else text | media: image',
          '  facebook  → caption: translatedText if non-English audience, else text | media: image (video if input mentions video campaign)',
          '  twitter   → caption: text                                              | media: image (null if no visual mentioned)',
          '  linkedin  → caption: summary                                           | media: null (image only if input explicitly mentions a visual post)',
          '  tiktok    → caption: translatedText if non-English audience, else text | media: video (image if input mentions photo carousel)',
          '  youtube   → caption: summary                                           | media: video',
          '',
          'Rule: default to the table above. Only deviate if the user input explicitly states otherwise.',
          '',
          // ── customSchedule ─────────────────────────────────────────────────
          'customSchedule must be an array of day name strings, e.g. ["monday", "wednesday", "friday"].',
          'Only populate it when postingFrequency is "custom". Otherwise return an empty array [].',
          '',
          // ── OUTPUT SCHEMA ──────────────────────────────────────────────────
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
                language: 'string (ISO 639-1 code, e.g. "en", "th")',
                targetLanguages: ['string (ISO 639-1 codes)'],
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
                customSchedule: ['monday | tuesday | wednesday | thursday | friday | saturday | sunday'],
              },
              channels: [
                {
                  channel: 'facebook | instagram | twitter | linkedin | youtube | tiktok',
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
    const parsed = parseJsonWithFenceOrThrow(text) as Omit<
      ExtractedRuleDraft,
      'status'
    >;
    const usage = extractUsageFromAiMessage(res);
    const channels = Array.isArray(parsed.channels)
      ? parsed.channels.map((ch) => normalizeExtractedChannel(ch))
      : [];
    return {
      draft: {
        ...parsed,
        channels,
        status: 'active' as RuleStatus,
      },
      usage,
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
