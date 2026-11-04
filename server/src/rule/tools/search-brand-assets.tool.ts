import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { RuleAssetSearchService } from '../rule-asset-search.service';

const SEARCH_BRAND_ASSETS_SCHEMA = z.object({
  query: z.string().describe('What to look for in this brand\'s uploaded guideline documents.'),
});

export function createSearchBrandAssetsTool(
  ruleId: string,
  searchService: RuleAssetSearchService,
) {
  return tool(
    async ({ query }) => {
      const results = await searchService.search(ruleId, query, 5);
      if (results.length === 0) {
        return 'No matching brand documents found.';
      }
      return results
        .map((r) => `[score ${r.score.toFixed(2)}] ${r.text}`)
        .join('\n\n');
    },
    {
      name: 'search_brand_assets',
      description:
        "Search this brand's uploaded guideline/reference documents (PDFs) for relevant passages. Use this before answering questions about brand-specific rules, tone, or requirements that might be documented.",
      schema: SEARCH_BRAND_ASSETS_SCHEMA,
    },
  );
}
