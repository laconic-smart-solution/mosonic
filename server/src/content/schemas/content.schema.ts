import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum ContentStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Approved = 'approved',
  Rejected = 'rejected',
}

@Schema({ _id: false })
export class ApprovalStepDef {
  @Prop({ type: String, required: true })
  role: string;

  @Prop({ type: Boolean, default: true })
  required: boolean;
}
export const ApprovalStepDefSchema = SchemaFactory.createForClass(ApprovalStepDef);

@Schema({ _id: false })
export class ApprovalRecord {
  @Prop({ type: Number, required: true })
  stepIndex: number;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: String, default: null })
  comment: string | null;
}
export const ApprovalRecordSchema = SchemaFactory.createForClass(ApprovalRecord);

@Schema({ _id: false })
export class ContentApprovalState {
  @Prop({ type: [ApprovalStepDefSchema], default: [] })
  steps: ApprovalStepDef[];

  @Prop({ type: Number, default: 0 })
  currentStepIndex: number;

  @Prop({ type: [ApprovalRecordSchema], default: [] })
  records: ApprovalRecord[];
}
export const ContentApprovalStateSchema =
  SchemaFactory.createForClass(ContentApprovalState);

/** AI-generated artifacts for one content version (URLs or inline text). */
@Schema({ _id: false })
export class ContentOutputs {
  @Prop({ type: String })
  keywords?: string;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: String })
  image?: string;

  @Prop({ type: String })
  translatedText?: string;

  @Prop({ type: String })
  video?: string;

  @Prop({ type: String })
  transcription?: string;

  @Prop({ type: String })
  summary?: string;
}
export const ContentOutputsSchema =
  SchemaFactory.createForClass(ContentOutputs);

/** User overrides layered on top of `outputs` for the same version. */
@Schema({ _id: false })
export class ContentUserEdits {
  @Prop({ type: String })
  keywords?: string;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: String })
  translatedText?: string;

  @Prop({ type: String })
  image?: string;

  @Prop({ type: String })
  video?: string;

  @Prop({ type: String })
  transcription?: string;

  @Prop({ type: String })
  summary?: string;
}
export const ContentUserEditsSchema =
  SchemaFactory.createForClass(ContentUserEdits);

/** Immutable snapshot for one content revision (full history kept). */
@Schema({ _id: false })
export class ContentVersionEntry {
  @Prop({ required: true, min: 1 })
  versionNumber: number;

  @Prop({ type: ContentOutputsSchema, required: true, default: {} })
  outputs: ContentOutputs;

  @Prop({ type: ContentUserEditsSchema, required: true, default: {} })
  userEdits: ContentUserEdits;

  /** Node-type key → prompt override before re-run (e.g. `image_generation`). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  nodePromptOverrides: Record<string, string>;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}
export const ContentVersionEntrySchema =
  SchemaFactory.createForClass(ContentVersionEntry);

@Schema({
  collection: 'contents',
  timestamps: true,
})
export class Content {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  contentId: string;

  /** App-local tenant id (`User.userId`); legacy rows may omit. */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ required: true, index: true })
  pipelineRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  /** Single-state AI outputs used by content detail/edit flows. */
  @Prop({ type: ContentOutputsSchema, default: {} })
  outputs: ContentOutputs;

  /** Single-state user edits layered on top of `outputs`. */
  @Prop({ type: ContentUserEditsSchema, default: {} })
  userEdits: ContentUserEdits;

  /** Node-type key -> prompt override used by re-run flows. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  nodePromptOverrides: Record<string, string>;

  /** Per workflow nodeId → AI output payload (e.g. `{ image }`, `{ text }`). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  nodeOutputs: Record<string, Record<string, unknown>>;

  /** Per nodeId → user overrides for that node's fields (merged over nodeOutputs when flattening). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  nodeUserEdits: Record<string, Record<string, unknown>>;

  /** Per lane key → adapt terminal outputs (multi-channel runs). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  laneOutputs: Record<string, Record<string, unknown>>;

  /** Legacy version fields kept for backward DB compatibility (unused by new flows). */
  @Prop({ type: Number, min: 1 })
  currentVersion?: number;

  @Prop({ type: [ContentVersionEntrySchema], default: [] })
  versions?: ContentVersionEntry[];

  @Prop({
    type: String,
    enum: Object.values(ContentStatus),
    default: ContentStatus.Draft,
  })
  status: ContentStatus;

  /** Multi-step approval routing; empty steps = single-step approve. */
  @Prop({ type: ContentApprovalStateSchema, default: () => ({ steps: [] }) })
  approval: ContentApprovalState;

  @Prop({ type: String, default: null })
  variantId?: string | null;

  @Prop({ type: String, default: null })
  experimentId?: string | null;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
export type ContentDocument = HydratedDocument<Content>;

ContentSchema.index({ workflowRef: 1, status: 1 });
ContentSchema.index({ ruleRef: 1, updatedAt: -1 });
ContentSchema.index({ userId: 1, updatedAt: -1 });
