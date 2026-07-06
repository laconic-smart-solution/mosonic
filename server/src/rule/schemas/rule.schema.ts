import { RuleStatus as PrismaRuleStatus } from '@prisma/client';
import type { RuleIntakeAnswers } from '../rule-intake.types';

export const RuleStatus = {
  ...PrismaRuleStatus,
  Processing: PrismaRuleStatus.processing,
  Active: PrismaRuleStatus.active,
  Archived: PrismaRuleStatus.archived,
  Failed: PrismaRuleStatus.failed,
} as const;

export type RuleStatus = (typeof RuleStatus)[keyof typeof RuleStatus];

export enum GenderOption {
  All = 'all',
  Male = 'male',
  Female = 'female',
}

export enum PostingFrequency {
  Daily = 'daily',
  Weekly = 'weekly',
  Custom = 'custom',
}

export enum OriginalInputType {
  File = 'file',
  Url = 'url',
  Text = 'text',
  Structured = 'structured',
}

export enum VersionChangedBy {
  User = 'user',
  SystemSuggestion = 'system_suggestion',
}

export enum ChannelPriority {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum CaptionMappingSource {
  Text = 'text',
  TranslatedText = 'translatedText',
  Summary = 'summary',
}

export enum ChannelMediaMapping {
  Image = 'image',
  Video = 'video',
}

export interface AgeRange {
  min: number;
  max: number;
}

export interface Brand {
  brandName: string;
  industry: string;
  brandDescription: string;
  brandTone: string[];
  brandVoice: string;
  brandRestrictions: string[];
  callToAction: string;
}

export interface Audience {
  description: string;
  ageRange: AgeRange;
  gender: GenderOption;
  location: string[];
  interests: string[];
  painPoints: string[];
  language: string;
  targetLanguages: string[];
}

export interface CampaignDuration {
  startDate: Date;
  endDate: Date;
}

export interface Campaign {
  goals: string[];
  keywords: string[];
  hashtagStrategy: string[];
  contentFormats: string[];
  duration: CampaignDuration;
  postingFrequency: PostingFrequency;
  customSchedule: string[];
}

export interface ContentMapping {
  caption: CaptionMappingSource;
  media?: ChannelMediaMapping | null;
}

export interface ChannelEntry {
  channel: string;
  priority: ChannelPriority;
  contentStyle: string;
  contentMapping?: ContentMapping;
}

export interface SeoGuidelines {
  primaryKeywords: string[];
  secondaryKeywords: string[];
  keywordDensity: string;
}

export interface ContentGuidelines {
  dos: string[];
  donts: string[];
  requiredElements: string[];
  seoGuidelines: SeoGuidelines;
}

export interface OriginalInput {
  type: OriginalInputType;
  storedAt: string;
}

export interface RuleVersion {
  versionNumber: number;
  changedFields: string[];
  changedBy: VersionChangedBy;
  snapshot: Record<string, unknown>;
  createdAt: Date;
}

export enum NewsTriggerSchedule {
  Daily = 'daily',
  TwiceDaily = 'twice_daily',
}

export enum NewsTriggerCategory {
  All = '',
  Business = 'business',
  Technology = 'technology',
  Entertainment = 'entertainment',
  Health = 'health',
  Science = 'science',
  Sports = 'sports',
  General = 'general',
}

export interface NewsTriggerConfig {
  enabled: boolean;
  schedule: NewsTriggerSchedule;
  country: string;
  language: string;
  category: NewsTriggerCategory;
  keywords: string[];
  minRelevanceScore: number;
  maxPostsPerDay: number;
  autoApprove: boolean;
  lastTriggeredAt: Date | null;
  totalTriggeredCount: number;
}

export interface Rule {
  ruleId: string;
  userId?: string;
  name: string;
  brand: Brand;
  audience: Audience;
  campaign: Campaign;
  channels: ChannelEntry[];
  contentGuidelines: ContentGuidelines;
  originalInput: OriginalInput;
  /** Structured wizard answers from rule creation (guided or express). */
  intake?: RuleIntakeAnswers | null;
  status: RuleStatus;
  versions: RuleVersion[];
  approvalPolicy: Array<{ role: string; required: boolean }>;
  autonomyPolicy: Record<string, unknown> | null;
  newsTrigger: NewsTriggerConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RuleDocument = Rule;
