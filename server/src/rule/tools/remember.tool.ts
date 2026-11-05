import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleMemoryService } from '../rule-memory.service';

const REMEMBER_SCHEMA = z.object({
  type: z
    .enum(['preference', 'correction', 'fact'])
    .describe(
      "preference: a standing choice ('always keep captions under 150 chars'). " +
        "correction: the user telling you to stop/change something ('never suggest infographics for LinkedIn'). " +
        "fact: a durable detail not in the brief ('office closes for renovation in December').",
    ),
  body: z
    .string()
    .describe('One short, self-contained sentence stating the thing to remember.'),
  replaceIds: z
    .array(z.string())
    .optional()
    .describe(
      'Ids (from "## Brand memory") of older notes on the same topic that this note updates or contradicts. They are removed so only the newest note remains.',
    ),
});

/**
 * Saves a durable note that doesn't belong in the Rule's structured fields
 * (brand/audience/campaign/...) or a document — operational preferences and
 * corrections the user states mid-conversation. Embedded on write so it's
 * also searchable later (search_brand_memory) once the list grows.
 */
export function createRememberTool(
  ruleId: string,
  ruleMemoryService: RuleMemoryService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ type, body, replaceIds }) => {
      const saved = await ruleMemoryService.remember(
        ruleId,
        type,
        body,
        auth,
        replaceIds ?? [],
      );
      const replaced = saved.replacedIds ?? [];
      return replaced.length > 0
        ? `Remembered (${type}): ${body}. Replaced ${replaced.length} older note(s).`
        : `Remembered (${type}): ${body}`;
    },
    {
      name: 'remember',
      description:
        "Save a durable preference, correction, or fact about this brand that isn't already captured in the brief. Call this as soon as the user states one — don't wait, and don't just apply it for one answer and forget it. If an existing note covers the same topic, pass its id in replaceIds. Never use this to change the workflow, channels, or brand fields - use the workflow tools or update_rule; a note does not change anything.",
      schema: REMEMBER_SCHEMA,
    },
  );
}
