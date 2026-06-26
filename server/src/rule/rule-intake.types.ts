export const CONTENT_PURPOSES = [
  'social_marketing',
  'thought_leadership',
  'internal_comms',
  'educational',
  'ecommerce',
  'other',
] as const;

export type ContentPurpose = (typeof CONTENT_PURPOSES)[number];

export type RuleIntakeMode = 'guided' | 'express';

export type RuleIntakeChannel = {
  channel: string;
  priority: 'high' | 'medium' | 'low';
  contentStyle?: string;
};

export type RuleIntakeAnswers = {
  mode: RuleIntakeMode;
  contentPurpose?: ContentPurpose;
  contentPurposeNotes?: string;
  additionalNotes?: string;
  brandName?: string;
  industry?: string;
  brandDescription?: string;
  brandTone?: string[];
  brandVoice?: string;
  callToAction?: string;
  audienceDescription?: string;
  locations?: string[];
  primaryLanguage?: string;
  targetLanguages?: string[];
  ageRange?: { min: number; max: number };
  channels?: RuleIntakeChannel[];
  goals?: string[];
  keywords?: string[];
  useHashtags?: boolean;
  hashtagStrategy?: string[];
  contentFormats?: string[];
  postingFrequency?: 'daily' | 'weekly' | 'custom';
  duration?: { startDate?: string; endDate?: string };
  dos?: string[];
  donts?: string[];
  requiredElements?: string[];
  useSeo?: boolean;
  primarySeoKeywords?: string[];
};
