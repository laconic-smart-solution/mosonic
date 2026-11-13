import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { LlmService } from '../../llm/llm.service';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';

const WEB_SEARCH_SCHEMA = z.object({
  query: z.string().describe('What to search for on the live web.'),
});

/** `onResult` lets the chat trust URLs a search found (e.g. the brand's own site). */
export function createWebSearchTool(llm: LlmService, onResult?: (text: string) => void) {
  return tool(
    async ({ query }) => {
      try {
        const result = await llm.runWebSearchBrief({
          prompt: query,
          provider: LlmProvider.OpenAI,
        });
        if (result.text) onResult?.(result.text);
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
