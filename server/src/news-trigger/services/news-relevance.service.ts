import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import { PickedArticle } from './news-picker.service';

export interface RelevanceResult {
  score: number;
  compatible: boolean;
  reasonSummary: string;
  suggestedAngle: string;
}

const MIN_KEYWORD_TOKEN_LENGTH = 3;

/** Split user keywords into lowercase tokens for flexible headline matching. */
export function tokenizeNewsKeywords(keywords: string[]): string[] {
  const tokens = new Set<string>();
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.length >= MIN_KEYWORD_TOKEN_LENGTH) {
      tokens.add(normalized);
    }
    for (const part of normalized.split(/[\s,/|]+/)) {
      const token = part.trim();
      if (token.length >= MIN_KEYWORD_TOKEN_LENGTH) {
        tokens.add(token);
      }
    }
  }
  return [...tokens];
}

@Injectable()
export class NewsRelevanceService {
  private readonly logger = new Logger(NewsRelevanceService.name);

  constructor(private readonly llm: LlmService) {}

  keywordPreFilter(article: PickedArticle, rule: Rule): boolean {
    const userKeywords = (rule.newsTrigger?.keywords ?? [])
      .map((k) => String(k).trim())
      .filter(Boolean);

    if (!userKeywords.length) return true;

    const articleText = [article.title, article.description]
      .join(' ')
      .toLowerCase();

    const tokens = tokenizeNewsKeywords(userKeywords);
    if (!tokens.length) return true;

    return tokens.some((token) => articleText.includes(token));
  }

  async checkRelevance(
    article: PickedArticle,
    rule: Rule,
  ): Promise<RelevanceResult> {
    this.logger.log(
      `[NewsRelevance] rule=${rule.ruleId} article="${article.title.slice(0, 50)}..."`,
    );

    const ruleSummary = {
      brand: {
        name: rule.brand.brandName,
        industry: rule.brand.industry,
        tone: rule.brand.brandTone,
      },
      audience: {
        description: rule.audience.description,
        language: rule.audience.language,
        location: rule.audience.location?.slice(0, 3) ?? [],
      },
      campaign: {
        goals: rule.campaign.goals,
      },
      doNots: rule.contentGuidelines?.donts?.slice(0, 5) ?? [],
    };

    const prompt = [
      'You are a content strategist. Evaluate whether this news article is',
      'relevant and safe for a brand to create content about.',
      '',
      'Score 0-100 based on:',
      '  industryMatch     (0-25): article topic relates to brand industry',
      '  goalAlignment     (0-25): news creates opportunity for campaign goals',
      '  audienceRelevance (0-20): brand audience would care about this',
      '  sentimentFit      (0-15): positive or neutral sentiment (not controversial)',
      '  restrictionPass   (0-15): does not violate brand restrictions',
      '',
      'Return ONLY JSON — no markdown:',
      '{',
      '  "totalScore": 82,',
      '  "compatible": true,',
      '  "reasonSummary": "Strong industry match, positive consumer sentiment",',
      '  "suggestedAngle": "Position brand as part of this market growth story"',
      '}',
      '',
      '=== NEWS ARTICLE ===',
      `Title: ${article.title}`,
      `Description: ${(article.description ?? '').slice(0, 500)}`,
      `Source: ${article.sourceId}`,
      `Published: ${article.pubDate}`,
      '',
      '=== BRAND RULE ===',
      JSON.stringify(ruleSummary, null, 2),
    ].join('\n');

    try {
      const model = this.llm.getChatModelForPlainText({ temperature: 0.2 });
      const result = await model.invoke([
        ['system', 'You are a content strategist. Return only valid JSON.'],
        ['human', prompt],
      ]);

      const text =
        typeof result.content === 'string' ? result.content : String(result.content);
      const parsed = this.safeParse(text);

      if (parsed) {
        return {
          score: Number(parsed.totalScore) || 0,
          compatible: Boolean(parsed.compatible),
          reasonSummary: String(parsed.reasonSummary ?? ''),
          suggestedAngle: String(parsed.suggestedAngle ?? ''),
        };
      }
    } catch (err) {
      this.logger.warn(
        `[NewsRelevance] GPT failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      score: 0,
      compatible: false,
      reasonSummary: 'Relevance check failed',
      suggestedAngle: '',
    };
  }

  private safeParse(text: string): Record<string, unknown> | null {
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
