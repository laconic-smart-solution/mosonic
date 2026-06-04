import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NewsArticle {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  sourceId: string;
  country: string[];
  language: string;
  category: string[];
}

@Injectable()
export class NewsFetchService {
  private readonly logger = new Logger(NewsFetchService.name);
  private readonly BASE_URL = 'https://newsdata.io/api/1/news';

  constructor(private readonly config: ConfigService) {}

  async fetchTopArticles(params: {
    country: string;
    language: string;
    category?: string;
    keywords?: string[];
    limit?: number;
  }): Promise<NewsArticle[]> {
    const apiKey = this.config.get<string>('NEWSDATA_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('NEWSDATA_API_KEY is not configured');
    }

    const query = new URLSearchParams({
      apikey: apiKey,
      country: params.country,
      language: params.language,
      size: String(params.limit ?? 10),
    });

    if (params.category?.trim()) {
      query.set('category', params.category.trim());
    }

    if (params.keywords?.length) {
      query.set('q', params.keywords.slice(0, 5).join(' OR '));
    }

    this.logger.log(
      `[NewsFetch] fetching country=${params.country} lang=${params.language}`,
    );

    const resp = await fetch(`${this.BASE_URL}?${query.toString()}`);

    if (!resp.ok) {
      throw new Error(`NewsData.io error ${resp.status}: ${resp.statusText}`);
    }

    const data = (await resp.json()) as {
      status?: string;
      results?: Array<Record<string, unknown>>;
    };

    if (data.status !== 'success') {
      throw new Error(
        `NewsData.io status: ${data.status} — ${JSON.stringify(data)}`,
      );
    }

    const articles = (data.results ?? []).map((r) => ({
      title: String(r.title ?? ''),
      description: String(r.description ?? ''),
      link: String(r.link ?? ''),
      pubDate: String(r.pubDate ?? ''),
      sourceId: String(r.source_id ?? ''),
      country: Array.isArray(r.country) ? (r.country as string[]) : [],
      language: String(r.language ?? ''),
      category: Array.isArray(r.category) ? (r.category as string[]) : [],
    }));

    this.logger.log(`[NewsFetch] got ${articles.length} articles`);

    return articles;
  }
}
