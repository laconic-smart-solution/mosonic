import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum ContentStatus {
  Draft = 'draft',
  Approved = 'approved',
  Rejected = 'rejected',
}

/** AI-generated artifacts for one content version (URLs or inline text). */
@Schema({ _id: false })
export class ContentOutputs {
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

  @Prop({ required: true, index: true })
  pipelineRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  /** Active version row in `versions` (must exist when versions is non-empty). */
  @Prop({ type: Number, required: true, default: 1, min: 1 })
  currentVersion: number;

  /** Full version history; append-only for audit. */
  @Prop({ type: [ContentVersionEntrySchema], default: [] })
  versions: ContentVersionEntry[];

  @Prop({
    type: String,
    enum: Object.values(ContentStatus),
    default: ContentStatus.Draft,
  })
  status: ContentStatus;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
export type ContentDocument = HydratedDocument<Content>;

ContentSchema.index({ pipelineRef: 1 });
ContentSchema.index({ workflowRef: 1, status: 1 });
ContentSchema.index({ ruleRef: 1, updatedAt: -1 });
