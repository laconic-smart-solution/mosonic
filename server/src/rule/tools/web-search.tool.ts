import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { LlmService } from '../../llm/llm.service';

const WEB_SEARCH_SCHEMA = z.object({
  query: z.string().describe('What to search for on the live web.'),
});

export function createWebSearchTool(llm: LlmService) {
  return tool(
    async ({ query }) => {
      try {
        const result = await llm.runWebSearchBrief({ prompt: query });
        return result.text || 'Web search returned no results.';
      } catch (err) {
        return `Web search is unavailable: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: 'web_search',
      description:
        'Search the live web for current information not covered by brand documents (e.g. recent news, trends, or facts outside this brand\'s own materials).',
      schema: WEB_SEARCH_SCHEMA,
    },
  );
}
