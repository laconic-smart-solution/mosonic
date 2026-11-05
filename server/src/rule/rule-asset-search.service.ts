import { Inject, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { RULE_ASSET_REPOSITORY } from '../repositories/tokens';
import type { IRuleAssetRepository } from '../repositories/interfaces/rule-asset.repository.interface';

export type RuleAssetSearchResult = {
  ruleAssetId: string;
  chunkIndex: number;
  text: string;
  score: number;
};

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Brute-force in-process similarity search over a Rule's asset chunks —
 * mirrors faq/'s `faq_ask.py` approach (JSONB embeddings, cosine distance
 * computed in application code, no pgvector). Not wired into any chat/
 * ReAct loop yet; that's a later phase.
 */
@Injectable()
export class RuleAssetSearchService {
  constructor(
    @Inject(RULE_ASSET_REPOSITORY)
    private readonly ruleAssets: IRuleAssetRepository,
    private readonly llm: LlmService,
  ) {}

  async search(
    ruleId: string,
    queryText: string,
    topK = 5,
  ): Promise<RuleAssetSearchResult[]> {
    const chunks = await this.ruleAssets.findChunksByRuleId(ruleId);
    if (chunks.length === 0) return [];

    const queryEmbedding = await this.llm.embedQuery(queryText);

    const scored = chunks
      .filter((c) => Array.isArray(c.embedding))
      .map((c) => ({
        ruleAssetId: c.ruleAssetId,
        chunkIndex: c.chunkIndex,
        text: c.text,
        score: cosineSimilarity(queryEmbedding, c.embedding as number[]),
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }
}
