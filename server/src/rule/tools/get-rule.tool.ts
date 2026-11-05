import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleService } from '../rule.service';

const GET_RULE_SCHEMA = z.object({});

/**
 * Re-fetches the current brand brief — most of this is already in the system
 * prompt, so this is for re-checking after something may have changed
 * mid-conversation, not the primary context source.
 */
export function createGetRuleTool(
  ruleId: string,
  ruleService: RuleService,
  auth: TenancyAuth,
) {
  return tool(
    async () => {
      const rule = await ruleService.getRuleById(ruleId, auth);
      return JSON.stringify(
        {
          name: rule.name,
          status: rule.status,
          brand: rule.brand,
          audience: rule.audience,
          campaign: rule.campaign,
          channels: rule.channels,
          contentGuidelines: rule.contentGuidelines,
        },
        null,
        2,
      );
    },
    {
      name: 'get_rule',
      description:
        'Re-fetch the current brand profile/brief. Most of it is already in your system prompt — only call this if you need to re-check something that may have changed during this conversation.',
      schema: GET_RULE_SCHEMA,
    },
  );
}
