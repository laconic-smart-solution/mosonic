import { Injectable } from '@nestjs/common';
import { FaqClientService } from './faq-client.service';

@Injectable()
export class FaqService {
  constructor(private readonly client: FaqClientService) {}

  listFaqs(params: {
    page?: number;
    limit?: number;
    q?: string;
    activeOnly?: boolean;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const q = params.q?.trim();
    const activeOnly = params.activeOnly ?? true;
    const search = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      active_only: String(activeOnly),
    });
    if (q) search.set('q', q);
    return this.client.get(`/faqs?${search.toString()}`);
  }

  ask(question: string, topK?: number) {
    return this.client.postJson('/faqs/ask', {
      question,
      ...(topK != null ? { top_k: topK } : {}),
    });
  }
}
