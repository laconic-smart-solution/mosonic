import { Inject, Injectable } from '@nestjs/common';
import type { TenancyAuth } from '../auth/tenancy.types';
import { LlmService } from '../llm/llm.service';
import { RULE_MEMORY_REPOSITORY } from '../repositories/tokens';
import type { IRuleMemoryRepository } from '../repositories/interfaces/rule-memory.repository.interface';
import { cosineSimilarity } from './rule-asset-search.service';

export type RuleMemorySearchResult = {
  ruleMemoryId: string;
  type: string;
  body: string;
  score: number;
};

/**
 * Brute-force in-process similarity search over a Rule's memories — same
 * approach as RuleAssetSearchService (JSONB embeddings, cosine computed in
 * application code, no pgvector). Used for recall beyond the recent-N window
 * that's always injected into the system prompt.
 */
@Injectable()
export class RuleMemorySearchService {
  constructor(
    @Inject(RULE_MEMORY_REPOSITORY)
    private readonly memories: IRuleMemoryRepository,
    private readonly llm: LlmService,
  ) {}

  async search(
    ruleId: string,
    queryText: string,
    auth: TenancyAuth,
    topK = 5,
  ): Promise<RuleMemorySearchResult[]> {
    const rows = await this.memories.findByRuleId(ruleId, auth);
    const embedded = rows.filter((r) => Array.isArray(r.embedding));
    if (embedded.length === 0) return [];

    const queryEmbedding = await this.llm.embedQuery(queryText);

    return embedded
      .map((r) => ({
        ruleMemoryId: r.ruleMemoryId,
        type: r.type,
        body: r.body,
        score: cosineSimilarity(queryEmbedding, r.embedding as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
