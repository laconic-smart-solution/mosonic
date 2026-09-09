import { normalizeChannelId } from './distribution-channels.util';

import { ruleChannelNamesToIds } from './distribution-channels.util';
import type { ChannelEntry } from '../rule/schemas/rule.schema';

export const WORKFLOW_QA_CHANNEL_OPTIONS = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
] as const;

export type WorkflowQaChannelId = (typeof WORKFLOW_QA_CHANNEL_OPTIONS)[number];

const QA_CHANNEL_SET = new Set<string>(WORKFLOW_QA_CHANNEL_OPTIONS);

export function isWorkflowQaChannelId(
  value: string,
): value is WorkflowQaChannelId {
  return QA_CHANNEL_SET.has(normalizeChannelId(value));
}

export function normalizeQaChannelIds(
  channels: string[],
): WorkflowQaChannelId[] {
  const seen = new Set<string>();
  const out: WorkflowQaChannelId[] = [];
  for (const raw of channels) {
    const id = normalizeChannelId(raw);
    if (!isWorkflowQaChannelId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function assertQaChannelSubset(
  channels: string[],
  fieldName: string,
): WorkflowQaChannelId[] {
  const normalized = normalizeQaChannelIds(channels);
  if (normalized.length !== channels.length) {
    throw new Error(
      `${fieldName} must only contain workflow Q&A channel ids: ${WORKFLOW_QA_CHANNEL_OPTIONS.join(', ')}`,
    );
  }
  return normalized;
}

export function intersectChannels(a: string[], b: string[]): string[] {
  const bSet = new Set(normalizeQaChannelIds(b));
  return normalizeQaChannelIds(a).filter((id) => bSet.has(id));
}

/** Keep only channels that exist on the rule; fall back to sole rule channel when unset. */
export function resolveQaNodeChannels(
  selected: string[] | undefined,
  ruleChannelIds: string[],
): string[] {
  const ruleIds = normalizeQaChannelIds(ruleChannelIds);
  if (!ruleIds.length) return [];
  const picked = intersectChannels(selected ?? [], ruleIds);
  if (picked.length) return picked;
  if (ruleIds.length === 1) return [...ruleIds];
  return [];
}

/** Distribution channel ids from the campaign rule (source of truth for workflow generation). */
export function resolveRuleChannelIds(
  ruleChannels: ChannelEntry[] | undefined | null,
): string[] {
  return ruleChannelNamesToIds(ruleChannels ?? []);
}
