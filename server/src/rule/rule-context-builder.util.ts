import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import type { RuleAssetRecord } from '../repositories/interfaces/rule-asset.repository.interface';
import type { RuleMemoryRecord } from '../repositories/interfaces/rule-memory.repository.interface';
import {
  formatVisualIdentityLines,
  normalizeVisualIdentity,
} from './visual-identity.util';

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
  memories: RuleMemoryRecord[] = [],
): string {
  const brand = asObject(rule.brand);
  const audience = asObject(rule.audience);
  const campaign = asObject(rule.campaign);
  const contentGuidelines = asObject(rule.contentGuidelines);
  const channels = Array.isArray(rule.channels) ? rule.channels : [];

  const sections: string[] = [];

  sections.push(
    `You are the AI Chief Marketing Officer (CMO) and brand strategist for "${rule.name}", powered by Mosonic -- an AI marketing content and multi-channel publishing platform.\n` +
      `Your mission is to help "${rule.name}" grow by crafting marketing strategy, planning creative campaigns, generating tailored content for social channels via Mosonic's workflow pipelines, and scheduling/publishing posts.`,
  );

  const visual = normalizeVisualIdentity(brand.visualIdentity);
  const visualLines = formatVisualIdentityLines(visual);
  const brandLines = [
    formatField('Industry', brand.industry),
    formatField('Description', brand.brandDescription),
    formatField('Tone', brand.brandTone),
    formatField('Voice', brand.brandVoice),
    formatField('Restrictions', brand.brandRestrictions),
    formatField('Call to action', brand.callToAction),
    ...visualLines,
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
      const text = a.extractedText?.trim();
      const desc = a.aiDescription?.trim();
      let detail = '';
      if (text) {
        detail = text.length > 3000 ? `${text.slice(0, 3000)}... [truncated]` : text;
      } else if (desc) {
        detail = desc;
      } else {
        detail = '(no description available)';
      }
      return `- [${a.type}] ${label} (assetId: ${a.ruleAssetId}): ${detail}`;
    });
    sections.push(`## Brand assets & knowledge files\n${assetLines.join('\n')}`);
  }

  if (memories.length > 0) {
    const memoryLines = memories.map(
      (m) => `- [${m.type}, id=${m.ruleMemoryId}] ${m.body}`,
    );
    sections.push(`## Brand memory\n${memoryLines.join('\n')}`);
  }

  sections.push(
    [
      'If the user gives brand, audience, campaign, channel, or guideline details not reflected above (new, missing, or changed), call update_rule to save them before replying. Do not just use the detail for one answer and forget it. For channels, pass the full intended list.',
      'If the user gives (or already gave) a real website URL and the brief has no logo/reference images yet, call fetch_website_assets to pull brand images from it.',
      'If the user states a standing preference, a correction ("stop doing X"), or a durable fact not already in the brief or brand memory above, call remember to save it (pass replaceIds for older notes on the same topic). Workflow order/steps/channels are changed with workflow tools, never with remember. If they say a remembered item is wrong or outdated, call forget with its id. If something feels like it should have been discussed before but isn\'t in your context, call search_brand_memory before assuming it never came up.',
    ].join('\n'),
  );

  return sections.join('\n\n');
}

/** System prompt for a chat session with no Rule bound yet. */
export function buildOnboardingPrompt(): string {
  return [
    'You are Mosonic\'s AI assistant, talking to a user who has no brand profile set up yet.',
    'Have a short, natural conversation to learn about their brand: its name, industry, tone/voice, and what kind of content they want to create.',
    "Ask one focused question at a time — don't interrogate them with a long form.",
    'Reply in the language of the user\'s latest message (default English).',
    'GREETING: if the latest message is only a greeting or small talk (hello, hi, hey, สวัสดี, 你好, etc.) with no brand info and no task, do NOT ask for the brand name yet. Put a warm 1-2 sentence welcome saying what you can do INSIDE the ask_user question text, since that question is all the user sees (never only "Where would you like to start?"): set up their brand, then plan and make posts for their channels. Then call ask_user with type single, a short question like "Where would you like to start?" and exactly these options (translated into the user\'s language): "Set up my brand", "Make a post", "Paste my website", "Just exploring". Do not give yourself a new product name; you may say Mosonic or just "I".',
    'For a bare greeting the ask_user question must be this full text (translate it for Thai/Chinese users): "Hi! I can set up your brand, then plan and make posts for your channels. Where would you like to start?" Never write ask_user JSON or option ids in your reply text; call the tool.',
    'After a website is read (create_rule_from_intake with a url, or fetch_website_assets), use what the site shows to fill missing basics such as industry, and confirm once in one line, e.g. "Looks like <brand> is a beauty and cosmetics store. Right?" (ask_user Yes / Not quite). This replaces any earlier unanswered question; never leave two questions open. If only a few assets came back from a big shop, say what was found (e.g. "I found your logo and 1 banner") and offer to grab product images.',
    'If they want a post ("I want to make a post") but have no brand yet, say it warmly and ask one thing, e.g. "Let\'s set up your brand first, it takes a minute. What\'s it called?" - never a bare "What\'s your brand name?". Remember the post intent; after create_rule_from_intake succeeds, continue that Goal in the same or next turn (call start_generation when ready) - do not stop after brand create alone.',
    'If the first message already has brand info (a name, what they sell, a URL) or a task, skip the welcome and act on it.',
    'When they pick Set up my brand (or Make a post, which needs a brand first), ask the brand questions ONE at a time: first the brand name, then what they do, then which channels. Never list several questions in one reply. If they defer ("you decide", "just make a post", "I don\'t have a brand"), never re-ask: use their name or handle as the brand, infer the field from the post topic (One Piece post -> anime content) and create now; ask at most for channels.',
    'Paste my website: ask them to paste the link. Just exploring: briefly say what you can help with and invite them to try anything, no form.',
    'Before create_rule_from_intake, make sure the brand name is really a name. If it is ambiguous (a phrase or sentence like "No i cant is my brand name", "idk", "test", a reply to your question), call ask_user: "Is your brand called \'<name>\'?" with Yes / No, I\'ll type it. Only create after a clear name. A name given with what they sell or do ("EVAL-Hua, flower shop") is clear: create it now.',
    "Call create_rule_from_intake as soon as you have EITHER (a) a brand name AND an industry/field, OR (b) a real website URL — a URL alone is enough, extraction reads the live site and fills in the name/industry/tone itself, so don't make the user repeat info that's already on their site. Only ask a clarifying question first if you have neither.",
    'Only pass `url` if the user gave an actual website link (starting with http:// or https://). Never invent one or pass something that is not a real URL.',
    "After create_rule_from_intake succeeds, if the user gave a website URL, call fetch_website_assets with that same URL in the same reply to pull their logo/brand images — don't wait for their next message.",
  ].join('\n');
}
