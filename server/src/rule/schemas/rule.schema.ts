import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum RuleStatus {
  Processing = 'processing',
  Active = 'active',
  Archived = 'archived',
  Failed = 'failed',
}

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

/** Which resolved output field supplies the default caption per channel */
export enum CaptionMappingSource {
  Text = 'text',
  TranslatedText = 'translatedText',
  Summary = 'summary',
}

/** Media slot used when posting (null = text-only defaults) */
export enum ChannelMediaMapping {
  Image = 'image',
  Video = 'video',
}

@Schema({ _id: false })
export class AgeRange {
  @Prop({ required: true, min: 0 })
  min: number;

  @Prop({ required: true, min: 0 })
  max: number;
}
export const AgeRangeSchema = SchemaFactory.createForClass(AgeRange);

@Schema({ _id: false })
export class Brand {
  @Prop({ required: true })
  brandName: string;

  @Prop({ required: true })
  industry: string;

  @Prop({ required: true })
  brandDescription: string;

  @Prop({ type: [String], default: [] })
  brandTone: string[];

  @Prop({ required: true })
  brandVoice: string;

  @Prop({ type: [String], default: [] })
  brandRestrictions: string[];

  @Prop({ required: true })
  callToAction: string;
}
export const BrandSchema = SchemaFactory.createForClass(Brand);

@Schema({ _id: false })
export class Audience {
  @Prop({ required: true })
  description: string;

  @Prop({ type: AgeRangeSchema, required: true })
  ageRange: AgeRange;

  @Prop({ type: String, enum: Object.values(GenderOption), required: true })
  gender: GenderOption;

  @Prop({ type: [String], default: [] })
  location: string[];

  @Prop({ type: [String], default: [] })
  interests: string[];

  @Prop({ type: [String], default: [] })
  painPoints: string[];

  @Prop({ required: true })
  language: string;

  @Prop({ type: [String], default: [] })
  targetLanguages: string[];
}
export const AudienceSchema = SchemaFactory.createForClass(Audience);

@Schema({ _id: false })
export class CampaignDuration {
  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;
}
export const CampaignDurationSchema =
  SchemaFactory.createForClass(CampaignDuration);

@Schema({ _id: false })
export class Campaign {
  @Prop({ type: [String], default: [] })
  goals: string[];

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ type: [String], default: [] })
  hashtagStrategy: string[];

  @Prop({ type: [String], default: [] })
  contentFormats: string[];

  @Prop({ type: CampaignDurationSchema, required: true })
  duration: CampaignDuration;

  @Prop({
    type: String,
    enum: Object.values(PostingFrequency),
    required: true,
  })
  postingFrequency: PostingFrequency;

  @Prop({ type: [String], default: [] })
  customSchedule: string[];
}
export const CampaignSchema = SchemaFactory.createForClass(Campaign);

@Schema({ _id: false })
export class ContentMapping {
  @Prop({
    type: String,
    enum: Object.values(CaptionMappingSource),
    required: true,
  })
  caption: CaptionMappingSource;

  @Prop({
    type: String,
    enum: Object.values(ChannelMediaMapping),
    required: false,
    default: undefined,
  })
  media?: ChannelMediaMapping | null;
}
export const ContentMappingSchema =
  SchemaFactory.createForClass(ContentMapping);

@Schema({ _id: false })
export class ChannelEntry {
  @Prop({ required: true })
  channel: string;

  @Prop({ type: String, enum: Object.values(ChannelPriority), required: true })
  priority: ChannelPriority;

  @Prop({ required: true })
  contentStyle: string;

  /** When absent on legacy docs, treat as `{ caption: text, media: null }`. */
  @Prop({ type: ContentMappingSchema, required: false })
  contentMapping?: ContentMapping;
}
export const ChannelEntrySchema = SchemaFactory.createForClass(ChannelEntry);

@Schema({ _id: false })
export class SeoGuidelines {
  @Prop({ type: [String], default: [] })
  primaryKeywords: string[];

  @Prop({ type: [String], default: [] })
  secondaryKeywords: string[];

  @Prop({ required: true })
  keywordDensity: string;
}
export const SeoGuidelinesSchema = SchemaFactory.createForClass(SeoGuidelines);

@Schema({ _id: false })
export class ContentGuidelines {
  @Prop({ type: [String], default: [] })
  dos: string[];

  @Prop({ type: [String], default: [] })
  donts: string[];

  @Prop({ type: [String], default: [] })
  requiredElements: string[];

  @Prop({ type: SeoGuidelinesSchema, required: true })
  seoGuidelines: SeoGuidelines;
}
export const ContentGuidelinesSchema =
  SchemaFactory.createForClass(ContentGuidelines);

@Schema({ _id: false })
export class OriginalInput {
  @Prop({
    type: String,
    enum: Object.values(OriginalInputType),
    required: true,
  })
  type: OriginalInputType;

  @Prop({ required: true })
  storedAt: string;
}
export const OriginalInputSchema = SchemaFactory.createForClass(OriginalInput);

/** Partial or full copy of rule state at this version (flexible shape). */
@Schema({ _id: false })
export class RuleVersion {
  @Prop({ required: true, min: 1 })
  versionNumber: number;

  @Prop({ type: [String], default: [] })
  changedFields: string[];

  @Prop({
    type: String,
    enum: Object.values(VersionChangedBy),
    required: true,
  })
  changedBy: VersionChangedBy;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot: Record<string, unknown>;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}
export const RuleVersionSchema = SchemaFactory.createForClass(RuleVersion);

@Schema({
  collection: 'rules',
  timestamps: true,
})
export class Rule {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  ruleId: string;

  /** App-local tenant id (`User.userId`); legacy rows may omit. */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: BrandSchema, required: true })
  brand: Brand;

  @Prop({ type: AudienceSchema, required: true })
  audience: Audience;

  @Prop({ type: CampaignSchema, required: true })
  campaign: Campaign;

  @Prop({ type: [ChannelEntrySchema], default: [] })
  channels: ChannelEntry[];

  @Prop({ type: ContentGuidelinesSchema, required: true })
  contentGuidelines: ContentGuidelines;

  @Prop({ type: OriginalInputSchema, required: true })
  originalInput: OriginalInput;

  @Prop({
    type: String,
    enum: Object.values(RuleStatus),
    default: RuleStatus.Active,
  })
  status: RuleStatus;

  @Prop({ type: [RuleVersionSchema], default: [] })
  versions: RuleVersion[];

  /** Optional multi-step content approval policy. */
  @Prop({
    type: [{ role: String, required: { type: Boolean, default: true } }],
    default: [],
  })
  approvalPolicy: Array<{ role: string; required: boolean }>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  autonomyPolicy: Record<string, unknown> | null;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);
export type RuleDocument = HydratedDocument<Rule>;

RuleSchema.index({ name: 1 });
RuleSchema.index({ status: 1, updatedAt: -1 });
RuleSchema.index({ userId: 1, updatedAt: -1 });
