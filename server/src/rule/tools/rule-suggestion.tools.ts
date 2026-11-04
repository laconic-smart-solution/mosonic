import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import {
  buildIntelligenceContextFromPostMetrics,
  type PostMetricRow,
} from '../../analytics/intelligence-context.util';
import type { ChannelMetrics } from '../../analytics/schemas/analytics.schema';
import type { PostService } from '../../post/post.service';
import type { PostAnalyticsDto } from '../../post/post-analytics.service';
import { PostStatus } from '../../post/schemas/post.schema';
import type { RuleService } from '../rule.service';
import {
  isSupportedSuggestionField,
  normalizeSuggestionFieldPath,
} from '../rule-suggestion-field-patch.util';
import { runTool, toolError, toolOk } from './tool-error.util';

type SuggestionDraft = {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
};

function engagementFromAnalytics(analytics: PostAnalyticsDto | null): {
  channel: string;
  metrics: ChannelMetrics;
} | null {
  if (!analytics?.platformMetrics?.length) return null;
  const best = [...analytics.platformMetrics].sort(
    (a, b) =>
      (b.metrics?.engagementRate ?? 0) - (a.metrics?.engagementRate ?? 0),
  )[0];
  if (!best?.metrics) return null;
  const m = best.metrics;
  return {
    channel: String(best.platform ?? '').toLowerCase(),
    metrics: {
      views: Number(m.views ?? 0),
      clicks: Number(m.clicks ?? 0),
      engagement: Number(m.engagement ?? 0),
      conversions: Number(m.conversions ?? 0),
      likes: Number(m.likes ?? 0),
      comments: Number(m.comments ?? 0),
      shares: Number(m.shares ?? 0),
      reach: Number(m.reach ?? 0),
      engagementRate: Number(m.engagementRate ?? 0),
    },
  };
}

function buildSuggestionsFromPerformance(
  rule: {
    brand?: { brandTone?: string[] | null } | null;
    campaign?: { keywords?: string[] | null } | null;
    channels?: Array<{ channel?: string; priority?: string }> | null;
  },
  rows: PostMetricRow[],
): SuggestionDraft[] {
  const { topPerformers, bottomPerformers } =
    buildIntelligenceContextFromPostMetrics(rows);
  const out: SuggestionDraft[] = [];

  const top = topPerformers[0];
  const bottom = bottomPerformers[0];
  if (
    top &&
    bottom &&
    top.channel !== bottom.channel &&
    (top.engagementRate ?? 0) > (bottom.engagementRate ?? 0) * 1.5
  ) {
    const channels = rule.channels ?? [];
    const topEntry = channels.find(
      (c) => String(c.channel ?? '').toLowerCase() === top.channel,
    );
    if (topEntry && String(topEntry.priority ?? '').toLowerCase() !== 'high') {
      out.push({
        field: `channels.${top.channel}.priority`,
        currentValue: topEntry.priority ?? 'medium',
        suggestedValue: 'high',
        reason: `${top.channel} posts had higher engagement (${Math.round((top.engagementRate ?? 0) * 100) / 100}) than ${bottom.channel}. Raise its priority.`,
        confidence: 'medium',
      });
    }
  }

  return out.slice(0, 3).filter((s) => isSupportedSuggestionField(s.field));
}

export function createSuggestRuleImprovementTool(
  ruleId: string,
  ruleService: RuleService,
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ refresh }) =>
      runTool(async () => {
        const rule = await ruleService.getRuleById(ruleId, auth);
        const listed = await postService.listPosts(auth, {
          page: 1,
          limit: 10,
          status: PostStatus.Published,
          ruleRef: ruleId,
        });
        const posts = listed.posts as Array<Record<string, unknown>>;
        if (posts.length === 0) {
          return toolOk({
            action: 'rule_suggestions',
            suggestions: [],
            message:
              'No published posts with metrics yet. Publish first, then ask again.',
          });
        }

        const rows: PostMetricRow[] = [];
        for (const post of posts) {
          const postId = String(post.postId ?? '');
          if (!postId) continue;
          let analytics: PostAnalyticsDto | null = null;
          if (refresh) {
            try {
              analytics = (await postService.syncPostAnalytics(postId, auth))
                .analytics;
            } catch {
              analytics = null;
            }
          } else {
            const detail = await postService.getPostDetail(postId, auth);
            analytics =
              detail && typeof detail === 'object' && 'analytics' in detail
                ? ((detail.analytics as PostAnalyticsDto | null) ?? null)
                : null;
          }
          const eng = engagementFromAnalytics(analytics);
          if (!eng?.channel) continue;
          rows.push({
            channel: eng.channel,
            contentRef: String(post.contentRef ?? postId),
            metrics: eng.metrics,
          });
        }

        if (rows.length === 0) {
          return toolOk({
            action: 'rule_suggestions',
            suggestions: [],
            message:
              'Posts exist but no analytics yet. Try get_post_analytics with refresh=true, then suggest again.',
          });
        }

        const suggestions = buildSuggestionsFromPerformance(
          rule as {
            brand?: { brandTone?: string[] | null } | null;
            campaign?: { keywords?: string[] | null } | null;
            channels?: Array<{ channel?: string; priority?: string }> | null;
          },
          rows,
        );

        return toolOk({
          action: 'rule_suggestions',
          suggestions,
          topChannels: [
            ...new Set(rows.map((r) => r.channel)),
          ],
          message:
            suggestions.length === 0
              ? 'Not enough signal for a rule change yet.'
              : 'Show these to the user; call apply_rule_suggestion only after they confirm one.',
        });
      }),
    {
      name: 'suggest_rule_improvement',
      description:
        'Analyze this brand’s published-post metrics and propose up to 3 Rule field improvements. Do not apply them — use apply_rule_suggestion after the user confirms.',
      schema: z.object({
        refresh: z
          .boolean()
          .optional()
          .describe('When true, sync analytics before suggesting.'),
      }),
    },
  );
}

export function createApplyRuleSuggestionTool(
  ruleId: string,
  ruleService: RuleService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ field, suggestedValue }) =>
      runTool(async () => {
        const path = normalizeSuggestionFieldPath(field);
        if (!isSupportedSuggestionField(path)) {
          return toolError(
            'bad_request',
            `Field "${field}" cannot be applied as a suggestion patch.`,
          );
        }
        let value: unknown = suggestedValue;
        if (typeof suggestedValue === 'string') {
          try {
            value = JSON.parse(suggestedValue) as unknown;
          } catch {
            value = suggestedValue;
          }
        }
        const updated = await ruleService.applySuggestionFieldPatch(
          ruleId,
          path,
          value,
          auth,
        );
        return toolOk({
          action: 'rule_suggestion_applied',
          field: path,
          ruleId: updated.ruleId,
        });
      }),
    {
      name: 'apply_rule_suggestion',
      description:
        'Apply one Rule improvement from suggest_rule_improvement (field + suggestedValue). Confirm with ask_user first.',
      schema: z.object({
        field: z
          .string()
          .min(1)
          .describe('Suggestion field path, e.g. campaign.keywords or channels.tiktok.priority'),
        suggestedValue: z
          .union([z.string(), z.array(z.string()), z.boolean(), z.number()])
          .describe('New value to apply (string, string[], number, or boolean).'),
      }),
    },
  );
}
