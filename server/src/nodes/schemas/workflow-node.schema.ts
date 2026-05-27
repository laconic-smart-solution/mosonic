import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  LlmProvider,
  WorkflowNodeType,
} from '../workflow-node-llm.enums';

export { WorkflowNodeType, LlmProvider } from '../workflow-node-llm.enums';
/**
 * Node **definition** only (template + provider defaults).
 * Per-run execution (input, output, status, retryCount) lives in
 * `Pipeline.nodes[]`, not on this document.
 */

export enum NodeOutputFormat {
  Paragraph = 'paragraph',
  Bullets = 'bullets',
  Caption = 'caption',
  /** Summarization node only */
  Tldr = 'tldr',
}

export enum NodeImageQuality {
  Standard = 'standard',
  Hd = 'hd',
}

export enum NodeImageStyle {
  Natural = 'natural',
  Vivid = 'vivid',
}

export enum NodeAspectRatio {
  R16x9 = '16:9',
  R9x16 = '9:16',
  R1x1 = '1:1',
  /** Portrait ~4:5 feed; image API uses nearest OpenAI size */
  R4x5 = '4:5',
}

/** Primary copy tone for text_generation (refines system prompt). */
export enum NodeTextTone {
  Professional = 'professional',
  Casual = 'casual',
  Friendly = 'friendly',
  Formal = 'formal',
  Witty = 'witty',
}

export enum NodeFormalityLevel {
  Formal = 'formal',
  Casual = 'casual',
}

export enum NodeMediaSourceType {
  Audio = 'audio',
  Video = 'video',
}

export enum NodeSummaryLength {
  Short = 'short',
  Medium = 'medium',
  Long = 'long',
}

/**
 * Provider / formatting knobs — only fields relevant to `type` are typically set.
 * (e.g. `size` for images, `sourceLanguage` for translation.)
 */
@Schema({ _id: false })
export class WorkflowNodeConfig {
  @Prop({ type: String, enum: Object.values(LlmProvider) })
  provider?: LlmProvider;

  /** e.g. gpt-4o, dall-e-3, sora, whisper-1 */
  @Prop({ type: String })
  model?: string;

  @Prop({ type: Number, min: 0, max: 2 })
  temperature?: number;

  @Prop({ type: Number, min: 1 })
  maxTokens?: number;

  @Prop({ type: String, enum: Object.values(NodeOutputFormat) })
  outputFormat?: NodeOutputFormat;

  @Prop({ type: String, enum: Object.values(NodeTextTone) })
  tone?: NodeTextTone;

  /** Target length for text_generation (short / medium / long). */
  @Prop({ type: String, enum: Object.values(NodeSummaryLength) })
  textLength?: NodeSummaryLength;

  /** e.g. 1024x1024 */
  @Prop({ type: String })
  size?: string;

  @Prop({ type: String, enum: Object.values(NodeImageQuality) })
  quality?: NodeImageQuality;

  @Prop({ type: String, enum: Object.values(NodeImageStyle) })
  style?: NodeImageStyle;

  @Prop({ type: Number, min: 1 })
  duration?: number;

  @Prop({ type: String })
  resolution?: string;

  @Prop({ type: String, enum: Object.values(NodeAspectRatio) })
  aspectRatio?: NodeAspectRatio;

  /** Image generation — things to avoid in the visual */
  @Prop({ type: String })
  negativePrompt?: string;

  @Prop({ type: String })
  sourceLanguage?: string;

  @Prop({ type: String })
  targetLanguage?: string;

  @Prop({ type: String, enum: Object.values(NodeFormalityLevel) })
  formalityLevel?: NodeFormalityLevel;

  @Prop({ type: Boolean })
  preserveFormatting?: boolean;

  @Prop({ type: String, enum: Object.values(NodeMediaSourceType) })
  sourceType?: NodeMediaSourceType;

  @Prop({ type: String })
  sourceUrl?: string;

  /** e.g. auto for detection */
  @Prop({ type: String })
  language?: string;

  @Prop({ type: String, enum: Object.values(NodeSummaryLength) })
  summaryLength?: NodeSummaryLength;

  /** Upstream node id for chained steps */
  @Prop({ type: String })
  sourceNodeRef?: string;

  /** branch node: rule_channels (lanes follow campaign rule channels) */
  @Prop({ type: String })
  mode?: string;

  /** adapt node: target channel name */
  @Prop({ type: String })
  channel?: string;

  /** adapt node: channel content style hint */
  @Prop({ type: String })
  contentStyle?: string;

  /** intelligence node: web search scope */
  @Prop({ type: String })
  searchType?: string;

  /** intelligence node: prompt when searchType is custom */
  @Prop({ type: String, default: null })
  customPrompt?: string | null;

  /** Lane-scoped subgraph: normalized channel handle (matches Branch sourceHandle ids). */
  @Prop({ type: String })
  laneId?: string;

  /** video_generation presenter (HeyGen) */
  @Prop({ type: String })
  heygenAvatarId?: string;

  @Prop({ type: String })
  heygenAvatarAssetId?: string;

  @Prop({ type: String })
  heygenAvatarPhotoUrl?: string;

  @Prop({ type: String })
  heygenBackgroundAssetId?: string;

  @Prop({ type: String })
  heygenBackgroundUrl?: string;

  @Prop({ type: String })
  heygenVoiceId?: string;

  /** landscape | portrait */
  @Prop({ type: String })
  heygenOrientation?: string;

  /** low | medium | high */
  @Prop({ type: String })
  heygenExpressiveness?: string;

  @Prop({ type: String })
  heygenMotionPrompt?: string;

  @Prop({ type: Boolean })
  removeBackground?: boolean;
}
export const WorkflowNodeConfigSchema =
  SchemaFactory.createForClass(WorkflowNodeConfig);

@Schema({
  collection: 'workflow_nodes',
  timestamps: true,
})
export class WorkflowNode {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  nodeId: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  /** Denormalized from owning workflow (`User.userId`). */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({
    type: String,
    enum: Object.values(WorkflowNodeType),
    required: true,
  })
  type: WorkflowNodeType;

  @Prop({ required: true, min: 0 })
  order: number;

  @Prop({ type: Boolean, required: true, default: true })
  isLocked: boolean;

  @Prop({ type: String })
  userPrompt?: string;

  @Prop({ type: WorkflowNodeConfigSchema, default: {} })
  config: WorkflowNodeConfig;

  /** Authoring lane hint; materialized runs set lane on pipeline nodes. */
  @Prop({ type: String })
  lane?: string;

  /** Canvas X coordinate for workflow editor layout. */
  @Prop({ type: Number })
  x?: number;

  /** Canvas Y coordinate for workflow editor layout. */
  @Prop({ type: Number })
  y?: number;
}

export const WorkflowNodeSchema = SchemaFactory.createForClass(WorkflowNode);
export type WorkflowNodeDocument = HydratedDocument<WorkflowNode>;

WorkflowNodeSchema.index({ workflowRef: 1, order: 1 });
WorkflowNodeSchema.index({ userId: 1, workflowRef: 1 });
