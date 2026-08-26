import type { ContentPurpose, RuleIntakeAnswers } from './rule-intake.types';

const PURPOSE_INSTRUCTIONS: Record<ContentPurpose, string> = {
  social_marketing:
    'Optimize for social media marketing: promotional CTAs, hashtags, and channel-native formats are appropriate.',
  thought_leadership:
    'Optimize for thought leadership: professional tone, insight-driven copy; minimize hard-sell CTAs and hashtag spam.',
  internal_comms:
    'Optimize for internal communications: no promotional CTAs, no hashtags, no social-media campaign defaults.',
  educational:
    'Optimize for educational content: clear explanations, learning goals; avoid aggressive sales language.',
  ecommerce:
    'Optimize for e-commerce: product-focused goals, conversion CTAs, and promotional keywords are appropriate.',
  other:
    'Follow the user intake notes for purpose; avoid assuming a social-media campaign unless evidence supports it.',
};

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyArray(value: string[] | undefined): boolean {
  return Array.isArray(value) && value.some((v) => v.trim().length > 0);
}

/** Human-readable intake block for preprocessing / extraction context. */
export function formatIntakeForContext(intake: RuleIntakeAnswers): string {
  const lines: string[] = [
    '=== USER RULE INTAKE (authoritative where provided) ===',
    `Mode: ${intake.mode}`,
  ];

  if (intake.contentPurpose) {
    lines.push(`Content purpose: ${intake.contentPurpose}`);
    if (nonEmpty(intake.contentPurposeNotes)) {
      lines.push(`Purpose notes: ${intake.contentPurposeNotes!.trim()}`);
    }
    lines.push(PURPOSE_INSTRUCTIONS[intake.contentPurpose]);
  }

  if (nonEmpty(intake.additionalNotes)) {
    lines.push(`Additional notes: ${intake.additionalNotes!.trim()}`);
  }

  if (nonEmpty(intake.brandName))
    lines.push(`Brand name: ${intake.brandName!.trim()}`);
  if (nonEmpty(intake.industry))
    lines.push(`Industry: ${intake.industry!.trim()}`);
  if (nonEmpty(intake.brandDescription)) {
    lines.push(`Brand description: ${intake.brandDescription!.trim()}`);
  }
  if (nonEmptyArray(intake.brandTone)) {
    lines.push(`Brand tone: ${intake.brandTone!.filter(Boolean).join(', ')}`);
  }
  if (nonEmpty(intake.brandVoice))
    lines.push(`Brand voice: ${intake.brandVoice!.trim()}`);
  if (nonEmpty(intake.callToAction))
    lines.push(`CTA: ${intake.callToAction!.trim()}`);

  if (nonEmpty(intake.audienceDescription)) {
    lines.push(`Audience: ${intake.audienceDescription!.trim()}`);
  }
  if (nonEmptyArray(intake.locations)) {
    lines.push(`Locations: ${intake.locations!.filter(Boolean).join(', ')}`);
  }
  if (nonEmpty(intake.primaryLanguage)) {
    lines.push(`Primary language: ${intake.primaryLanguage!.trim()}`);
  }
  if (nonEmptyArray(intake.targetLanguages)) {
    lines.push(
      `Target languages: ${intake.targetLanguages!.filter(Boolean).join(', ')}`,
    );
  }

  if (intake.channels && intake.channels.length > 0) {
    lines.push('Channels (user-selected):');
    for (const ch of intake.channels) {
      lines.push(
        `  - ${ch.channel} (priority: ${ch.priority}${ch.contentStyle ? `, style: ${ch.contentStyle}` : ''})`,
      );
    }
  }

  if (nonEmptyArray(intake.goals)) {
    lines.push(`Goals: ${intake.goals!.filter(Boolean).join(', ')}`);
  }
  if (nonEmptyArray(intake.keywords)) {
    lines.push(`Keywords: ${intake.keywords!.filter(Boolean).join(', ')}`);
  }
  if (intake.useHashtags === false) {
    lines.push('Hashtags: user disabled — use empty hashtagStrategy.');
  } else if (nonEmptyArray(intake.hashtagStrategy)) {
    lines.push(
      `Hashtags: ${intake.hashtagStrategy!.filter(Boolean).join(', ')}`,
    );
  }
  if (nonEmptyArray(intake.contentFormats)) {
    lines.push(
      `Content formats: ${intake.contentFormats!.filter(Boolean).join(', ')}`,
    );
  }
  if (intake.postingFrequency) {
    lines.push(`Posting frequency: ${intake.postingFrequency}`);
  }
  if (intake.duration?.startDate || intake.duration?.endDate) {
    lines.push(
      `Campaign duration: ${intake.duration.startDate ?? '?'} to ${intake.duration.endDate ?? '?'}`,
    );
  }

  if (nonEmptyArray(intake.dos)) lines.push(`Do: ${intake.dos!.join(', ')}`);
  if (nonEmptyArray(intake.donts))
    lines.push(`Do not: ${intake.donts!.join(', ')}`);
  if (nonEmptyArray(intake.requiredElements)) {
    lines.push(`Required elements: ${intake.requiredElements!.join(', ')}`);
  }
  if (intake.useSeo === false) {
    lines.push('SEO: user disabled — keep SEO keyword lists minimal.');
  } else if (nonEmptyArray(intake.primarySeoKeywords)) {
    lines.push(`SEO keywords: ${intake.primarySeoKeywords!.join(', ')}`);
  }

  lines.push(
    'Do not override any field explicitly provided above. Fill only missing fields from document evidence.',
  );

  return lines.join('\n');
}

export function buildExtractionContext(
  documentSummary: string,
  intake?: RuleIntakeAnswers,
): string {
  const parts: string[] = [];
  if (intake) {
    parts.push(formatIntakeForContext(intake));
    parts.push('');
  }
  parts.push('=== SOURCE MATERIAL SUMMARY ===');
  parts.push(documentSummary.trim());
  return parts.join('\n');
}

export function intakePurposeSystemHint(intake?: RuleIntakeAnswers): string {
  if (!intake?.contentPurpose) return '';
  return [
    `CONTENT PURPOSE: ${intake.contentPurpose}`,
    PURPOSE_INSTRUCTIONS[intake.contentPurpose],
    'Respect user intake fields — never contradict explicit intake values.',
  ].join('\n');
}
