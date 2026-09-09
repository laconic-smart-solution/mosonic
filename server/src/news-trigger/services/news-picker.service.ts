import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { NewsArticle } from './news-fetch.service';

export interface PickedArticle extends NewsArticle {
  importanceScore: number;
  importanceReason: string;
}

@Injectable()
export class NewsPickerService {
  private readonly logger = new Logger(NewsPickerService.name);

  constructor(private readonly llm: LlmService) {}

  async pickTopArticles(
    articles: NewsArticle[],
    count = 2,
  ): Promise<PickedArticle[]> {
    if (!articles.length) return [];

    this.logger.log(
      `[NewsPicker] picking top ${count} from ${articles.length} articles`,
    );

    const prompt = [
      'You are a senior news editor.',
      `Pick the ${count} most newsworthy and impactful articles from the list below.`,
      '',
      'Prioritize articles that are:',
      '  - Breaking news or major developments',
      '  - Relevant to business and brands',
      '  - Factual, not opinion or sponsored',
      '  - Likely to affect multiple industries',
      '',
      'Return ONLY a JSON array — no markdown, no explanation:',
      '[',
      '  {',
      '    "index": 0,',
      '    "importanceScore": 90,',
      '    "importanceReason": "Major market event affecting retail sector"',
      '  }',
      ']',
      '',
      '=== ARTICLES ===',
      articles
        .map(
          (a, i) =>
            `[${i}] ${a.title}\n    ${(a.description ?? '').slice(0, 200)}`,
        )
        .join('\n\n'),
    ].join('\n');

    try {
      const model = this.llm.getChatModelForPlainText({ temperature: 0.2 });
      const result = await model.invoke([
        ['system', 'You are a news editor. Return only valid JSON array.'],
        ['human', prompt],
      ]);

      const text =
        typeof result.content === 'string'
          ? result.content
          : String(result.content);
      const parsed = this.safeParseArray(text);

      const picked = parsed
        .filter(
          (p: { index?: number }) =>
            typeof p.index === 'number' && articles[p.index],
        )
        .slice(0, count)
        .map(
          (p: {
            index: number;
            importanceScore?: number;
            importanceReason?: string;
          }) => ({
            ...articles[p.index],
            importanceScore: Number(p.importanceScore) || 70,
            importanceReason: String(p.importanceReason ?? ''),
          }),
        );

      if (picked.length) return picked;
    } catch (err) {
      this.logger.warn(
        `[NewsPicker] GPT failed: ${err instanceof Error ? err.message : String(err)} — using fallback`,
      );
    }

    return articles.slice(0, count).map((a) => ({
      ...a,
      importanceScore: 70,
      importanceReason: 'Auto-selected (fallback)',
    }));
  }

  private safeParseArray(text: string): Array<{
    index: number;
    importanceScore?: number;
    importanceReason?: string;
  }> {
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<{ index: number }>) : [];
    } catch {
      return [];
    }
  }
}
