import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleMemorySearchService } from '../rule-memory-search.service';

const SEARCH_BRAND_MEMORY_SCHEMA = z.object({
  query: z.string().describe('What to recall about this brand from past conversations.'),
});

/**
 * RAG search over this Rule's memories — for recall beyond the recent-N
 * window already in the system prompt (e.g. "what did we decide about
 * hashtags a while back?").
 */
export function createSearchBrandMemoryTool(
  ruleId: string,
  ruleMemorySearchService: RuleMemorySearchService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ query }) => {
      const results = await ruleMemorySearchService.search(ruleId, query, auth);
      if (results.length === 0) {
        return 'No matching memory found.';
      }
      return results
        .map((r) => `[${r.type}, id=${r.ruleMemoryId}] ${r.body}`)
        .join('\n');
    },
    {
      name: 'search_brand_memory',
      description:
        "Search this brand's saved memories (preferences/corrections/facts) for something not already in your context — use this before saying you don't know or assuming something was never discussed.",
      schema: SEARCH_BRAND_MEMORY_SCHEMA,
    },
  );
}
