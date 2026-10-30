import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import type { RuleAssetRecord } from '../repositories/interfaces/rule-asset.repository.interface';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function str(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function formatField(label: string, value: unknown): string | null {
  const text = str(value).trim();
  return text ? `${label}: ${text}` : null;
}

/**
 * Compiles a Rule's structured brief + its brand assets into one system-prompt
 * string — the "brain" a future chat/ReAct module would send as context.
 * Pure string builder, no LLM call, no chat dependency — the Rule's own
 * structured fields (brand/audience/campaign/channels/contentGuidelines) are
 * read as-is and never modified here.
 */
export function buildRuleBrainPrompt(
  rule: RuleRecord,
  assets: RuleAssetRecord[] = [],
): string {
  const brand = asObject(rule.brand);
  const audience = asObject(rule.audience);
  const campaign = asObject(rule.campaign);
  const contentGuidelines = asObject(rule.contentGuidelines);
  const channels = Array.isArray(rule.channels) ? rule.channels : [];

  const sections: string[] = [];

  sections.push(`You are the AI brand assistant for "${rule.name}".`);

  const brandLines = [
    formatField('Industry', brand.industry),
    formatField('Description', brand.brandDescription),
    formatField('Tone', brand.brandTone),
    formatField('Voice', brand.brandVoice),
    formatField('Restrictions', brand.brandRestrictions),
    formatField('Call to action', brand.callToAction),
  ].filter((l): l is string => l !== null);
  if (brandLines.length > 0) {
    sections.push(`## Brand\n${brandLines.join('\n')}`);
  }

  const audienceLines = [
    formatField('Description', audience.description),
    formatField('Age range', audience.ageRange),
    formatField('Gender', audience.gender),
    formatField('Location', audience.location),
    formatField('Interests', audience.interests),
    formatField('Pain points', audience.painPoints),
    formatField('Language', audience.language),
    formatField('Target languages', audience.targetLanguages),
  ].filter((l): l is string => l !== null);
  if (audienceLines.length > 0) {
    sections.push(`## Audience\n${audienceLines.join('\n')}`);
  }

  const campaignLines = [
    formatField('Goals', campaign.goals),
    formatField('Keywords', campaign.keywords),
    formatField('Hashtag strategy', campaign.hashtagStrategy),
    formatField('Content formats', campaign.contentFormats),
    formatField('Posting frequency', campaign.postingFrequency),
  ].filter((l): l is string => l !== null);
  if (campaignLines.length > 0) {
    sections.push(`## Campaign\n${campaignLines.join('\n')}`);
  }

  if (channels.length > 0) {
    sections.push(`## Channels\n${channels.map(String).join(', ')}`);
  }

  if (Object.keys(contentGuidelines).length > 0) {
    sections.push(
      `## Content guidelines\n${JSON.stringify(contentGuidelines)}`,
    );
  }

  const readyAssets = assets.filter((a) => a.status === 'ready');
  if (readyAssets.length > 0) {
    const assetLines = readyAssets.map((a) => {
      const label = a.originalFileName || a.ruleAssetId;
      const detail =
        a.aiDescription?.trim() ||
        (a.extractedText ? a.extractedText.slice(0, 500) : '') ||
        '(no description available)';
      return `- [${a.type}] ${label}: ${detail}`;
    });
    sections.push(`## Brand assets\n${assetLines.join('\n')}`);
  }

  return sections.join('\n\n');
}
