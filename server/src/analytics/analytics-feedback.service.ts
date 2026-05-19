import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RuleDocument } from '../rule/schemas/rule.schema';
import {
  isSupportedSuggestionField,
  normalizeSuggestionFieldPath,
} from '../rule/rule-suggestion-field-patch.util';
import { LlmService } from '../llm/llm.service';
import type { CampaignSummary, ContentPerformanceEntry } from './schemas/analytics.schema';
import {
  FeedbackSignalStatus,
  SuggestionConfidence,
  type FeedbackSignal,
} from './schemas/analytics.schema';

@Injectable()
export class AnalyticsFeedbackService {
  private readonly logger = new Logger(AnalyticsFeedbackService.name);

  constructor(private readonly llm: LlmService) {}

  async analyze(
    rule: RuleDocument,
    contentPerformance: ContentPerformanceEntry[],
    summary: CampaignSummary,
  ): Promise<FeedbackSignal> {
    const model = this.llm.getChatModel();

    const ruleLean = {
      ruleId: rule.ruleId,
      name: rule.name,
      brand: rule.brand,
      audience: rule.audience,
      campaign: rule.campaign,
      channels: rule.channels,
      contentGuidelines: rule.contentGuidelines,
    };

    const prompt = [
      'You are a marketing performance analyst.',
      'Analyze the content performance data below and suggest improvements to the brand rule.',
      'Return a JSON object with key "suggestions" containing an array of suggestion objects.',
      '',
      '=== PERFORMANCE DATA ===',
      `Campaign Summary: ${JSON.stringify(summary)}`,
      '',
      `Content Performance: ${JSON.stringify(contentPerformance)}`,
      '',
      '=== CURRENT RULE ===',
      JSON.stringify(ruleLean),
      '',
      '=== SUGGESTION RULES ===',
      'Only suggest changes that are clearly supported by the data.',
      'Each suggestion must have a specific measurable reason.',
      'Do NOT suggest changes to: brandVoice, brandRestrictions, audience fields, contentGuidelines.',
      'Use EXACT field paths (required for apply):',
      '  brand.brandTone (string[]), brand.brandName, brand.industry, brand.brandDescription, brand.callToAction',
      '  campaign.keywords (string[]), campaign.hashtagStrategy (string[]), campaign.contentFormats (string[]), campaign.goals (string[])',
      '  campaign.postingFrequency (daily|weekly|custom), campaign.customSchedule (string[])',
      '  channels[<platform>].priority (low|medium|high), channels[<platform>].contentStyle (string)',
      'Never use brand.keywords — keywords belong under campaign.keywords.',
      '',
      '=== CONFIDENCE LEVELS ===',
      'high   → clear pattern in data, consistent across multiple posts',
      'medium → some evidence but limited data',
      'low    → single data point, speculative',
      '',
      '=== OUTPUT FORMAT ===',
      'Strict JSON only. Example shape:',
      '{"suggestions":[{"field":"brand.brandTone","currentValue":["formal"],"suggestedValue":["casual"],"reason":"...","confidence":"high"}]}',
    ].join('\n');

    try {
      const res = await model.invoke([
        new SystemMessage(
          'You are a marketing analyst. Reply with a single JSON object only, no markdown.',
        ),
        new HumanMessage(prompt),
      ]);

      const text =
        typeof res.content === 'string'
          ? res.content
          : JSON.stringify(res.content ?? null);

      const parsed = JSON.parse(text) as { suggestions?: unknown[] };
      const suggestions = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : [];

      const mapped = suggestions
        .filter((s: Record<string, unknown>) => String(s.field ?? '').trim())
        .map((s: Record<string, unknown>) => {
          const confRaw =
            typeof s.confidence === 'string' ? s.confidence.toLowerCase() : '';
          let confidence = SuggestionConfidence.Medium;
          if (confRaw === 'high') confidence = SuggestionConfidence.High;
          else if (confRaw === 'low') confidence = SuggestionConfidence.Low;

          const field = normalizeSuggestionFieldPath(String(s.field ?? ''));

          return {
            field,
            currentValue: s.currentValue ?? null,
            suggestedValue: s.suggestedValue ?? null,
            reason: String(s.reason ?? ''),
            confidence,
            status: FeedbackSignalStatus.Pending,
          };
        })
        .filter((s) => isSupportedSuggestionField(s.field));

      const dropped = suggestions.length - mapped.length;
      if (dropped > 0) {
        this.logger.warn(
          `Dropped ${dropped} suggestion(s) with unsupported field paths`,
        );
      }

      return { suggestions: mapped };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI feedback analysis failed: ${message}`);
      return { suggestions: [] };
    }
  }
}
