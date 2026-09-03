import { toPromptToon } from '../../common/utils/toon.util';
import type { Rule } from '../../rule/schemas/rule.schema';
import type { IntelligenceSearchTypeValue } from '../workflow-node-config.zod';
import { formatGenerationTemporalContext } from './generation-temporal-context.util';

function withTemporalContext(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return formatGenerationTemporalContext();
  }
  return `${formatGenerationTemporalContext()}\n\n${trimmed}`;
}

export function buildIntelligenceSearchPrompt(
  searchType: IntelligenceSearchTypeValue,
  rule: Rule,
  customPrompt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (searchType === 'custom') {
    const custom = customPrompt?.trim() ?? '';
    return withTemporalContext(custom);
  }

  const industry = rule.brand.industry;
  const brandName = rule.brand.brandName;
  const audienceDesc = rule.audience.description;
  const locations = rule.audience.location.join(', ') || 'global';
  const channels =
    rule.channels.map((c) => c.channel).join(', ') || 'social media';
  const todayIso = now.toISOString().slice(0, 10);

  const prompts: Record<
    Exclude<IntelligenceSearchTypeValue, 'custom'>,
    string
  > = {
    trend: `
Search for trending social media content this week (as of ${todayIso}) for a ${industry} brand
targeting ${audienceDesc} on ${channels}.
Return: top 5 hashtags, best performing content format this week,
platform engagement patterns. Be specific and current.
    `.trim(),
    market: `
Search for recent news and market signals for the ${industry} industry
in ${locations} from the past 7 days from today (${todayIso}).
Return: top 3 relevant headlines, overall market sentiment,
any events or moments a brand should reference in content this week.
    `.trim(),
    competitor: `
Search for recent social media content from brands in the ${industry} industry
similar to ${brandName}. Look at their public posts and campaigns this week (as of ${todayIso}).
Return: common content angles competitors are using,
themes that are overused, and content gaps no competitor is covering.
    `.trim(),
    all: `
Search and return a structured intelligence brief for a ${industry} brand
called ${brandName} targeting ${audienceDesc} (as of ${todayIso}).

Cover three areas:
1. TREND — Top trending hashtags and content formats this week on ${channels}
2. MARKET — Recent industry news and market signals from the past 7 days from today (${todayIso})
3. COMPETITOR — What similar brands are posting, what's overused, what gaps exist

Return a structured brief ready to inform content generation.
    `.trim(),
  };

  return withTemporalContext(prompts[searchType]);
}

export function appendAnalyticsContextToPrompt(
  basePrompt: string,
  ctx:
    | {
        topPerformers?: unknown[];
        bottomPerformers?: unknown[];
        pendingSuggestions?: unknown[];
      }
    | undefined,
): string {
  if (!ctx) {
    return basePrompt;
  }
  const parts: string[] = [];
  if (ctx.topPerformers?.length) {
    parts.push(`Top performers:\n${toPromptToon(ctx.topPerformers)}`);
  }
  if (ctx.bottomPerformers?.length) {
    parts.push(`Underperformers:\n${toPromptToon(ctx.bottomPerformers)}`);
  }
  if (ctx.pendingSuggestions?.length) {
    parts.push(
      `Pending suggestions (read-only):\n${toPromptToon(ctx.pendingSuggestions)}`,
    );
  }
  if (parts.length === 0) {
    return basePrompt;
  }
  return [
    basePrompt,
    '',
    '=== INTERNAL PERFORMANCE CONTEXT (from analytics) ===',
    ...parts,
  ].join('\n');
}
