import type { ChannelEntry } from '../rule/schemas/rule.schema';
import { ChannelPriority } from '../rule/schemas/rule.schema';

export type DistributionChannel = {
  id: string;
  label: string;
};

export const DISTRIBUTION_CHANNELS: DistributionChannel[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
];

const LABEL_BY_ID = new Map(
  DISTRIBUTION_CHANNELS.map((c) => [c.id, c.label] as const),
);

export function normalizeChannelId(channel: string): string {
  return channel.trim().toLowerCase();
}

export function channelLabel(channelId: string): string {
  const id = normalizeChannelId(channelId);
  return LABEL_BY_ID.get(id) ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : id);
}

export function channelIdsToChannelEntries(
  channelIds: string[],
  ruleChannels: ChannelEntry[] = [],
): ChannelEntry[] {
  const seen = new Set<string>();
  const entries: ChannelEntry[] = [];
  for (const raw of channelIds) {
    const id = normalizeChannelId(raw);
    if (!id || seen.has(id) || !LABEL_BY_ID.has(id)) continue;
    seen.add(id);
    const fromRule = ruleChannels.find(
      (ch) => normalizeChannelId(ch.channel) === id,
    );
    entries.push({
      channel: channelLabel(id),
      priority: fromRule?.priority ?? ChannelPriority.Medium,
      contentStyle: fromRule?.contentStyle ?? 'platform-native',
    });
  }
  return entries;
}

export function ruleChannelNamesToIds(
  ruleChannels: ChannelEntry[] | undefined | null,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of ruleChannels ?? []) {
    const id = normalizeChannelId(row.channel);
    if (!id || seen.has(id) || !LABEL_BY_ID.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
