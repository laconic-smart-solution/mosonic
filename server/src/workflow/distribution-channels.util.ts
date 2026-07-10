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
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'rednote', label: 'RedNote' },
];

/** Retired platforms — excluded from pickers and publishing. */
export const DEPRECATED_CHANNEL_IDS = new Set(['twitter', 'x']);

export function isDeprecatedChannelId(channel: string): boolean {
  return DEPRECATED_CHANNEL_IDS.has(normalizeChannelId(channel));
}

const LABEL_BY_ID = new Map(
  DISTRIBUTION_CHANNELS.map((c) => [c.id, c.label] as const),
);

const ID_BY_LABEL = new Map(
  DISTRIBUTION_CHANNELS.map((c) => [c.label.trim().toLowerCase(), c.id] as const),
);

export function normalizeChannelId(channel: string): string {
  return channel.trim().toLowerCase();
}

/** Map rule labels, aliases, or ids to a canonical distribution channel id. */
export function resolveDistributionChannelId(channel: string): string {
  const raw = normalizeChannelId(channel);
  if (!raw) return raw;
  if (LABEL_BY_ID.has(raw)) return raw;
  const fromLabel = ID_BY_LABEL.get(raw);
  if (fromLabel) return fromLabel;
  if (isDeprecatedChannelId(raw) || raw.includes('twitter')) return '';
  return raw;
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
      (ch) => resolveDistributionChannelId(ch.channel) === id,
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
    const id = resolveDistributionChannelId(row.channel);
    if (!id || seen.has(id) || !LABEL_BY_ID.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
