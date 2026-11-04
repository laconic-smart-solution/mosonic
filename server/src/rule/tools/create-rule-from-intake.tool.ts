import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { RuleService } from '../rule.service';
import { toolError } from './tool-error.util';
import { rejectUntrustedUrl } from './url-guard.util';
import type { RuleIntakeAnswers } from '../rule-intake.types';

const CREATE_RULE_FROM_INTAKE_SCHEMA = z.object({
  description: z
    .string()
    .describe(
      'Free-text description of the brand — name, industry, tone, what they want to create. Include everything learned from the conversation so far.',
    ),
  url: z
    .string()
    .optional()
    .describe(
      "Optional: the brand's actual website URL (must start with http:// or https://). " +
        'Omit this entirely if the user did not give a real link — never pass placeholder text.',
    ),
  brandName: z
    .string()
    .optional()
    .describe('The confirmed brand name, exactly as the user gave it.'),
  channels: z
    .array(z.string())
    .optional()
    .describe(
      'Channels the user said they post on (instagram, facebook, linkedin, youtube, tiktok, rednote). Saved on the profile so a workflow can be created right away.',
    ),
});

const KNOWN_CHANNELS = new Set(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'rednote']);

const CHANNEL_MENTIONS: [string, RegExp][] = [
  ['facebook', /\b(facebook|fb)\b|เฟซบุ๊ก|เฟสบุ๊ค|脸书|臉書/i],
  ['instagram', /\b(instagram|insta|ig)\b|ไอจี|อินสตาแกรม/i],
  ['tiktok', /\btik ?tok\b|ติ๊กต็อก|ติ๊กต๊อก|抖音/i],
  ['linkedin', /\blinked ?in\b|ลิงก์อิน|领英/i],
  ['youtube', /\byou ?tube\b|ยูทูบ|油管/i],
  ['rednote', /\b(rednote|red note|xiaohongshu|xhs)\b|小红书|小紅書/i],
];
const NEGATED = /\b(not|no|without|except|never|skip)\b[^.,;\n]{0,20}$|ไม่[^.,;\n]{0,10}$|不[^.,;\n]{0,6}$/i;

/**
 * Channels the user named in their own messages ("we only post on Facebook",
 * a facebook.com link), minus ones they ruled out ("not TikTok"). Used when
 * the model leaves `channels` out, so extraction can't fill in every platform.
 */
export function channelsNamedIn(texts: string[]): string[] {
  const found: string[] = [];
  for (const text of texts) {
    for (const [channel, pattern] of CHANNEL_MENTIONS) {
      const global = new RegExp(pattern.source, 'gi');
      for (const m of text.matchAll(global)) {
        if (NEGATED.test(text.slice(0, m.index))) continue;
        if (!found.includes(channel)) found.push(channel);
        break;
      }
    }
  }
  return found;
}

/** Guided-intake answers from what the user said explicitly; null when nothing to pin. */
export function intakeFromArgs(
  brandName: string | undefined,
  channels: string[] | undefined,
): RuleIntakeAnswers | undefined {
  const name = brandName?.trim();
  const picked = [
    ...new Set((channels ?? []).map((c) => c.trim().toLowerCase()).filter((c) => KNOWN_CHANNELS.has(c))),
  ];
  if (!name && picked.length === 0) return undefined;
  return {
    mode: 'guided',
    ...(name ? { brandName: name } : {}),
    ...(picked.length ? { channels: picked.map((channel) => ({ channel, priority: 'high' as const })) } : {}),
  };
}

/**
 * Kicks off brand-profile extraction (reuses RuleService.requestExtraction
 * as-is — same flow as the existing /rules/extract endpoint). Creation is
 * synchronous (a real ruleId comes back immediately); the extraction itself
 * finishes in the background over the existing rule_${ruleId} socket room.
 * `onRuleCreated` lets the caller (ChatSessionService) bind the new ruleId
 * onto the chat session without this tool needing to know about sessions.
 */
export function createCreateRuleFromIntakeTool(
  ruleService: RuleService,
  auth: TenancyAuth,
  onRuleCreated: (ruleId: string) => Promise<void> | void,
  /** The user's own messages this session; a URL must come from them. */
  getUserTexts?: () => string[],
) {
  return tool(
    async ({ description, url, brandName, channels }) => {
      const trimmedUrl = url?.trim() || '';
      if (trimmedUrl) {
        const reason = rejectUntrustedUrl(trimmedUrl, getUserTexts?.());
        if (reason) {
          // Do not create a profile from a made-up site.
          return toolError(
            'url_not_provided',
            `${reason} Nothing was created. Ask the user to paste their real website URL, or call again without url using only what they told you.`,
          );
        }
      }
      const validUrl = trimmedUrl || null;

      const { ruleId } = await ruleService.requestExtraction(
        {
          input: description,
          files: [],
          urls: validUrl ? [validUrl] : [],
          // No channels arg: pin the ones the user named so the profile (and the
          // default workflow's lanes) is not filled with every platform.
          intake: intakeFromArgs(
            brandName,
            channels?.length ? channels : channelsNamedIn(getUserTexts?.() ?? []),
          ),
        },
        auth,
      );
      await onRuleCreated(ruleId);

      return "Started building the brand profile. I'll have full brand context from your next message — extraction is running in the background.";
    },
    {
      name: 'create_rule_from_intake',
      description:
        "Create a new brand profile from the conversation. Call this as soon as you have EITHER a brand name AND an industry/field, OR a real website URL (a URL alone is enough — extraction reads the live site and fills in the rest, so don't ask the user to repeat what's already on their site). Only ask a clarifying question first if you have neither. Never call it with placeholder or guessed values (never example.com). If the user only said they have a website, ask them to paste it first. Pass everything you've learned as `description`, plus brandName and channels when the user said them; only include `url` if the user gave an actual link (http/https).",
      schema: CREATE_RULE_FROM_INTAKE_SCHEMA,
    },
  );
}
