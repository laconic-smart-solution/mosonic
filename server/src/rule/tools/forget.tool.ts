import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleMemoryService } from '../rule-memory.service';

const FORGET_SCHEMA = z.object({
  memoryId: z
    .string()
    .describe(
      'The memory id to remove, exactly as shown in the "## Brand memory" section of your context (id=...).',
    ),
});

/** Removes every note for this brand in one change ("forget everything"). */
export function createForgetAllTool(
  ruleId: string,
  ruleMemoryService: RuleMemoryService,
  auth: TenancyAuth,
) {
  return tool(
    async () => {
      const removed = await ruleMemoryService.forgetAll(ruleId, auth);
      return removed === 0
        ? 'No saved notes to remove.'
        : `Removed all ${removed} saved note(s). Brand memory is now empty.`;
    },
    {
      name: 'forget_all',
      description:
        'Remove ALL saved brand memory notes in one change. Use when the user asks to clear/remove everything from memory. Counts as a single change.',
      schema: z.object({}),
    },
  );
}

/** Deletes a memory the user says is wrong or no longer applies. */
export function createForgetTool(
  ruleMemoryService: RuleMemoryService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ memoryId }) => {
      try {
        await ruleMemoryService.forget(memoryId, auth);
        return 'Forgotten.';
      } catch {
        return `No memory found with id ${memoryId}.`;
      }
    },
    {
      name: 'forget',
      description:
        "Remove a previously saved memory when the user says it's wrong, outdated, or should no longer apply. Use the memory id from the brand memory section of your context — never guess an id.",
      schema: FORGET_SCHEMA,
    },
  );
}
