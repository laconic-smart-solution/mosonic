import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DISTRIBUTION_CHANNELS } from '../../workflow/distribution-channels.util';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';
import { toolError } from './tool-error.util';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { UpdateRuleDto } from '../dto/update-rule.dto';
import type { RuleService } from '../rule.service';

const UPDATE_RULE_SCHEMA = z.object({
  name: z
    .string()
    .optional()
    .describe('New name for the brand profile, only if the user wants to rename it.'),
  brand: z
    .object({
      brandName: z
        .string()
        .optional()
        .describe(
          'Only set when the user gave this name, or it is the name on the website they sent. Never invent or swap the brand name.',
        ),
      industry: z.string().optional(),
      brandDescription: z.string().optional(),
      brandTone: z.array(z.string()).optional(),
      brandVoice: z.string().optional(),
      brandRestrictions: z.array(z.string()).optional(),
      callToAction: z.string().optional(),
    })
    .optional()
    .describe(
      'Only the brand fields the user just gave or changed — never resend values already correct in the brief.',
    ),
  audience: z
    .object({
      description: z.string().optional(),
      ageRange: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
      gender: z.enum(['all', 'male', 'female']).optional(),
      location: z.array(z.string()).optional(),
      interests: z.array(z.string()).optional(),
      painPoints: z.array(z.string()).optional(),
      language: z.string().optional(),
      targetLanguages: z.array(z.string()).optional(),
    })
    .optional()
    .describe('Only the audience fields the user just gave or changed.'),
  campaign: z
    .object({
      goals: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      hashtagStrategy: z.array(z.string()).optional(),
      contentFormats: z.array(z.string()).optional(),
      duration: z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional(),
      postingFrequency: z.enum(['daily', 'weekly', 'custom']).optional(),
      customSchedule: z.array(z.string()).optional(),
    })
    .optional()
    .describe(
      'Only the campaign fields the user just gave or changed (goals, keywords, hashtags, formats, dates, posting cadence).',
    ),
  channels: z
    .array(
      z.object({
        channel: z.string().describe('Platform id, e.g. instagram, facebook, tiktok, linkedin, youtube.'),
        priority: z.enum(['high', 'medium', 'low']),
        contentStyle: z.string(),
      }),
    )
    .optional()
    .describe(
      'Full replacement list of distribution channels. Send the complete intended set, not a single add/remove.',
    ),
  contentGuidelines: z
    .object({
      dos: z.array(z.string()).optional(),
      donts: z.array(z.string()).optional(),
      requiredElements: z.array(z.string()).optional(),
      seoGuidelines: z
        .object({
          primaryKeywords: z.array(z.string()).optional(),
          secondaryKeywords: z.array(z.string()).optional(),
          keywordDensity: z.string().optional(),
        })
        .optional(),
    })
    .optional()
    .describe('Only guideline fields the user just gave or changed (dos, donts, required elements, SEO).'),
});

/**
 * Saves new/changed brief fields into the Rule — reuses RuleService.patchRule
 * (same merge as PATCH /rules/:ruleId). Synchronous, no re-extraction.
 */
export function createUpdateRuleTool(
  ruleId: string,
  ruleService: RuleService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ name, brand, audience, campaign, channels, contentGuidelines }) => {
      if (!name && !brand && !audience && !campaign && !channels && !contentGuidelines) {
        return 'Nothing to update — no fields were given.';
      }
      if (channels !== undefined) {
        const known = new Set(DISTRIBUTION_CHANNELS.map((c) => c.id));
        const bad = channels.map((c) => c.channel).filter((c) => !known.has(normalizeLaneId(c)));
        if (bad.length > 0) {
          return toolError(
            'unsupported_channel',
            `Nothing changed. ${bad.join(', ')} is not a supported channel. Supported: ${DISTRIBUTION_CHANNELS.map((c) => c.label).join(', ')}.`,
          );
        }
      }
      const dto = {
        ...(name !== undefined ? { name } : {}),
        ...(brand !== undefined ? { brand } : {}),
        ...(audience !== undefined ? { audience } : {}),
        ...(campaign !== undefined ? { campaign } : {}),
        ...(channels !== undefined ? { channels } : {}),
        ...(contentGuidelines !== undefined ? { contentGuidelines } : {}),
      } as UpdateRuleDto;

      await ruleService.patchRule(ruleId, dto, auth);
      return 'Brand profile updated.';
    },
    {
      name: 'update_rule',
      description:
        'Save new or changed details into the brand profile (name, brand, audience, campaign, channels, content guidelines). Call this BEFORE answering whenever the user gives information that is missing from, or different from, what\'s already in the brief. Only when they asked to change the profile; only pass fields that are new or changed and never fill in tone, audience, campaign or guidelines they did not give. For channels, pass the full intended list (supported only; for an unsupported channel change nothing). Channel change ("post only on facebook"): also call set_workflow_channels in the same turn so the workflow lanes match (if unsure the workflow should change, ask_user "Update the workflow to only <channels> too?"). If Live state shows no workflow, call only this and do not mention a workflow. Not for "the image is for <channel>" (update_node_config lane) or putting the current post on another channel (generate_more_adapt).',
      schema: UPDATE_RULE_SCHEMA,
    },
  );
}
