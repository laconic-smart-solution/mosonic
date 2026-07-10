import type { ExtractedRuleDraft } from './rule-extraction.service';
import type { RuleIntakeAnswers } from './rule-intake.types';

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function cleanedStrings(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values.map((v) => v.trim()).filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function isGuidedFieldOverride(intake: RuleIntakeAnswers): boolean {
  return intake.mode === 'guided';
}

/**
 * Apply authoritative guided intake over LLM-extracted draft.
 */
export function mergeIntakeWithExtracted(
  intake: RuleIntakeAnswers | undefined,
  draft: ExtractedRuleDraft,
): ExtractedRuleDraft {
  if (!intake || intake.mode === 'express') {
    return applyExpressPurposeHints(intake, draft);
  }

  const merged: ExtractedRuleDraft = {
    ...draft,
    brand: { ...draft.brand },
    audience: { ...draft.audience },
    campaign: {
      ...draft.campaign,
      duration: { ...draft.campaign.duration },
    },
    contentGuidelines: {
      ...draft.contentGuidelines,
      seoGuidelines: { ...draft.contentGuidelines.seoGuidelines },
    },
    channels: draft.channels.map((c) => ({ ...c, contentMapping: { ...c.contentMapping } })),
  };

  const name = trimmed(intake.brandName);
  if (name) merged.name = name;

  const brandName = trimmed(intake.brandName);
  if (brandName) merged.brand.brandName = brandName;
  const industry = trimmed(intake.industry);
  if (industry) merged.brand.industry = industry;
  const brandDescription = trimmed(intake.brandDescription);
  if (brandDescription) merged.brand.brandDescription = brandDescription;
  const tones = cleanedStrings(intake.brandTone);
  if (tones) merged.brand.brandTone = tones;
  const brandVoice = trimmed(intake.brandVoice);
  if (brandVoice) merged.brand.brandVoice = brandVoice;
  const cta = trimmed(intake.callToAction);
  if (cta) merged.brand.callToAction = cta;

  const audienceDescription = trimmed(intake.audienceDescription);
  if (audienceDescription) merged.audience.description = audienceDescription;
  const locations = cleanedStrings(intake.locations);
  if (locations) merged.audience.location = locations;
  const primaryLanguage = trimmed(intake.primaryLanguage);
  if (primaryLanguage) merged.audience.language = primaryLanguage;
  const targetLanguages = cleanedStrings(intake.targetLanguages);
  if (targetLanguages) merged.audience.targetLanguages = targetLanguages;
  if (intake.ageRange) {
    merged.audience.ageRange = { ...intake.ageRange };
  }

  if (intake.channels && intake.channels.length > 0) {
    merged.channels = intake.channels.map((ch) => ({
      channel: ch.channel,
      priority: ch.priority,
      contentStyle: ch.contentStyle?.trim() ?? '',
      contentMapping: draft.channels.find(
        (d) => d.channel.toLowerCase() === ch.channel.toLowerCase(),
      )?.contentMapping ?? {
        caption: 'text' as const,
        media: 'image' as const,
      },
    }));
  }

  const goals = cleanedStrings(intake.goals);
  if (goals) merged.campaign.goals = goals;
  const keywords = cleanedStrings(intake.keywords);
  if (keywords) merged.campaign.keywords = keywords;

  if (intake.useHashtags === false) {
    merged.campaign.hashtagStrategy = [];
  } else {
    const hashtags = cleanedStrings(intake.hashtagStrategy);
    if (hashtags) merged.campaign.hashtagStrategy = hashtags;
  }

  const formats = cleanedStrings(intake.contentFormats);
  if (formats) merged.campaign.contentFormats = formats;

  if (intake.postingFrequency) {
    merged.campaign.postingFrequency = intake.postingFrequency;
  }

  if (intake.duration?.startDate) {
    merged.campaign.duration.startDate = intake.duration.startDate;
  }
  if (intake.duration?.endDate) {
    merged.campaign.duration.endDate = intake.duration.endDate;
  }

  const dos = cleanedStrings(intake.dos);
  if (dos) merged.contentGuidelines.dos = dos;
  const donts = cleanedStrings(intake.donts);
  if (donts) merged.contentGuidelines.donts = donts;
  const required = cleanedStrings(intake.requiredElements);
  if (required) merged.contentGuidelines.requiredElements = required;

  if (intake.useSeo === false) {
    merged.contentGuidelines.seoGuidelines.primaryKeywords = [];
    merged.contentGuidelines.seoGuidelines.secondaryKeywords = [];
  } else {
    const seo = cleanedStrings(intake.primarySeoKeywords);
    if (seo) merged.contentGuidelines.seoGuidelines.primaryKeywords = seo;
  }

  return applyPurposeDefaults(intake, merged);
}

function applyExpressPurposeHints(
  intake: RuleIntakeAnswers | undefined,
  draft: ExtractedRuleDraft,
): ExtractedRuleDraft {
  if (!intake?.contentPurpose) return draft;
  return applyPurposeDefaults(intake, { ...draft });
}

function applyPurposeDefaults(
  intake: RuleIntakeAnswers,
  draft: ExtractedRuleDraft,
): ExtractedRuleDraft {
  if (intake.contentPurpose === 'internal_comms') {
    if (!trimmed(intake.callToAction) && isGuidedFieldOverride(intake)) {
      draft.brand.callToAction = 'Learn more';
    }
    if (intake.useHashtags === false || intake.contentPurpose === 'internal_comms') {
      if (!cleanedStrings(intake.hashtagStrategy)) {
        draft.campaign.hashtagStrategy = [];
      }
    }
    if (!cleanedStrings(intake.donts)) {
      draft.contentGuidelines.donts = [
        ...new Set([
          ...draft.contentGuidelines.donts,
          'promotional sales language',
          'hashtags',
        ]),
      ];
    }
  }
  return draft;
}

export function hasMeaningfulGuidedIntake(intake: RuleIntakeAnswers): boolean {
  if (intake.mode !== 'guided') return false;
  return Boolean(
    intake.contentPurpose ||
      (intake.channels && intake.channels.length > 0) ||
      trimmed(intake.brandName) ||
      trimmed(intake.audienceDescription) ||
      trimmed(intake.additionalNotes) ||
      nonEmptyArray(intake.goals),
  );
}

function nonEmptyArray(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.some((v) => v.trim().length > 0);
}
