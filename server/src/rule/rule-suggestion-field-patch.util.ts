import { BadRequestException } from '@nestjs/common';
import type { RuleDocument } from './schemas/rule.schema';
import {
  ChannelPriority,
  type ChannelEntry,
  PostingFrequency,
} from './schemas/rule.schema';
import type { UpdateRuleDto } from './dto/update-rule.dto';

const BRAND_KEYS = new Set([
  'brandName',
  'industry',
  'brandDescription',
  'brandTone',
  'callToAction',
]);

const CAMPAIGN_KEYS = new Set([
  'goals',
  'keywords',
  'hashtagStrategy',
  'contentFormats',
  'postingFrequency',
  'customSchedule',
]);

/** LLM often prefixes campaign fields with `brand.` — remap to patchable paths. */
const SUGGESTION_FIELD_ALIASES: Record<string, string> = {
  'brand.keywords': 'campaign.keywords',
  'brand.hashtagStrategy': 'campaign.hashtagStrategy',
  'brand.contentFormats': 'campaign.contentFormats',
  'brand.goals': 'campaign.goals',
  'brand.postingFrequency': 'campaign.postingFrequency',
  'brand.customSchedule': 'campaign.customSchedule',
};

export function normalizeSuggestionFieldPath(field: string): string {
  const raw = field.trim();
  if (!raw) return raw;
  return SUGGESTION_FIELD_ALIASES[raw] ?? raw;
}

export function isSupportedSuggestionField(field: string): boolean {
  const raw = normalizeSuggestionFieldPath(field);
  if (!raw) return false;
  if (parseChannelField(raw)) return true;
  const brandMatch = /^brand\.([a-zA-Z]+)$/.exec(raw);
  if (brandMatch) {
    const key = brandMatch[1];
    if (key === 'brandVoice' || key === 'brandRestrictions') return false;
    return BRAND_KEYS.has(key);
  }
  const campaignMatch = /^campaign\.([a-zA-Z]+)$/.exec(raw);
  if (campaignMatch) {
    return CAMPAIGN_KEYS.has(campaignMatch[1]);
  }
  return false;
}

function asStringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const out = v.filter((x) => typeof x === 'string');
    if (out.length === v.length) return out;
    return null;
  }
  if (typeof v === 'string') return [v];
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function isChannelPriority(v: unknown): v is ChannelPriority {
  return (
    typeof v === 'string' &&
    (Object.values(ChannelPriority) as string[]).includes(v)
  );
}

function isPostingFrequency(v: unknown): v is PostingFrequency {
  return (
    typeof v === 'string' &&
    (Object.values(PostingFrequency) as string[]).includes(v)
  );
}

function parseChannelField(raw: string): {
  channelKey: string;
  sub: 'priority' | 'contentStyle';
} | null {
  const chBracket = /^channels\[([^\]]+)\]\.(priority|contentStyle)$/.exec(raw);
  const chDot = /^channels\.([^.]+)\.(priority|contentStyle)$/.exec(raw);
  const m = chBracket ?? chDot;
  if (!m) return null;
  return {
    channelKey: m[1].trim().toLowerCase(),
    sub: m[2] as 'priority' | 'contentStyle',
  };
}

/**
 * Build a partial {@link UpdateRuleDto} for an analytics suggestion.
 * Channel paths merge into the rule's existing `channels` array (PATCH replaces
 * `channels` in Mongo, so the full merged array is returned).
 */
export function buildSuggestionUpdateDto(
  existing: Pick<RuleDocument, 'brand' | 'campaign' | 'channels'>,
  field: string,
  suggestedValue: unknown,
): UpdateRuleDto {
  const raw = normalizeSuggestionFieldPath(field);
  if (!raw) {
    throw new BadRequestException('Empty suggestion field');
  }

  const ch = parseChannelField(raw);
  if (ch) {
    const { channelKey, sub } = ch;
    if (sub === 'priority' && !isChannelPriority(suggestedValue)) {
      throw new BadRequestException('Invalid channel priority');
    }
    if (
      sub === 'contentStyle' &&
      (typeof suggestedValue !== 'string' || !suggestedValue.trim())
    ) {
      throw new BadRequestException('contentStyle must be a non-empty string');
    }
    let hit = false;
    const next: ChannelEntry[] = (existing.channels ?? []).map((row) => {
      if (row.channel.trim().toLowerCase() !== channelKey) return row;
      hit = true;
      if (sub === 'priority') {
        return { ...row, priority: suggestedValue as ChannelPriority };
      }
      return { ...row, contentStyle: suggestedValue as string };
    });
    if (!hit) {
      throw new BadRequestException(
        `Channel "${channelKey}" is not configured on this rule`,
      );
    }
    return { channels: next };
  }

  const brandMatch = /^brand\.([a-zA-Z]+)$/.exec(raw);
  if (brandMatch) {
    const key = brandMatch[1];
    if (key === 'brandVoice' || key === 'brandRestrictions') {
      throw new BadRequestException(`Field not allowed: ${field}`);
    }
    if (!BRAND_KEYS.has(key)) {
      throw new BadRequestException(`Unknown brand field: ${field}`);
    }
    if (key === 'brandTone') {
      const arr = asStringArray(suggestedValue);
      if (!arr) throw new BadRequestException('brandTone must be string[]');
      return { brand: { brandTone: arr } };
    }
    const s = asString(suggestedValue);
    if (!s) throw new BadRequestException(`${key} must be a string`);
    return {
      brand: { [key]: s },
    };
  }

  const campaignMatch = /^campaign\.([a-zA-Z]+)$/.exec(raw);
  if (campaignMatch) {
    const key = campaignMatch[1];
    if (!CAMPAIGN_KEYS.has(key)) {
      throw new BadRequestException(`Unknown campaign field: ${field}`);
    }
    if (key === 'postingFrequency') {
      if (!isPostingFrequency(suggestedValue)) {
        throw new BadRequestException('Invalid postingFrequency');
      }
      return {
        campaign: {
          postingFrequency: suggestedValue,
        },
      };
    }
    const arr = asStringArray(suggestedValue);
    if (!arr) {
      throw new BadRequestException(`${key} must be string[]`);
    }
    return {
      campaign: { [key]: arr },
    };
  }

  throw new BadRequestException(`Unsupported suggestion field: ${field}`);
}
