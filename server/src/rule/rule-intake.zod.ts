import { z } from 'zod';
import { CONTENT_PURPOSES } from './rule-intake.types';

const channelSchema = z.object({
  channel: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  contentStyle: z.string().optional(),
});

export const ruleIntakeAnswersSchema = z.object({
  mode: z.enum(['guided', 'express']),
  contentPurpose: z.enum(CONTENT_PURPOSES).optional(),
  contentPurposeNotes: z.string().optional(),
  additionalNotes: z.string().optional(),
  brandName: z.string().optional(),
  industry: z.string().optional(),
  brandDescription: z.string().optional(),
  brandTone: z.array(z.string()).optional(),
  brandVoice: z.string().optional(),
  callToAction: z.string().optional(),
  audienceDescription: z.string().optional(),
  locations: z.array(z.string()).optional(),
  primaryLanguage: z.string().optional(),
  targetLanguages: z.array(z.string()).optional(),
  ageRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  channels: z.array(channelSchema).optional(),
  goals: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  useHashtags: z.boolean().optional(),
  hashtagStrategy: z.array(z.string()).optional(),
  contentFormats: z.array(z.string()).optional(),
  postingFrequency: z.enum(['daily', 'weekly', 'custom']).optional(),
  duration: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .optional(),
  dos: z.array(z.string()).optional(),
  donts: z.array(z.string()).optional(),
  requiredElements: z.array(z.string()).optional(),
  useSeo: z.boolean().optional(),
  primarySeoKeywords: z.array(z.string()).optional(),
});

export type ParsedRuleIntakeAnswers = z.infer<typeof ruleIntakeAnswersSchema>;
