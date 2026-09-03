import { CampaignAutonomyMode as PrismaCampaignAutonomyMode } from '@prisma/client';

export const AutonomyMode = {
  ...PrismaCampaignAutonomyMode,
  Off: PrismaCampaignAutonomyMode.off,
  ReviewOptional: PrismaCampaignAutonomyMode.review_optional,
  FullAuto: PrismaCampaignAutonomyMode.full_auto,
} as const;

export type AutonomyMode = (typeof AutonomyMode)[keyof typeof AutonomyMode];

export interface QuietHours {
  start: string;
  end: string;
  timezone: string;
}

export interface CampaignAutonomyPolicy {
  policyId: string;
  ruleRef: string;
  userId: string;
  enabled: boolean;
  mode: AutonomyMode;
  allowedChannels: string[];
  maxPostsPerDay: number;
  quietHours: QuietHours | null;
  blockIfPendingSuggestions: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CampaignAutonomyPolicyDocument = CampaignAutonomyPolicy;
