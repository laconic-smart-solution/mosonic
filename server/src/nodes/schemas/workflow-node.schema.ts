import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

/**
 * Node **definition** only (template + provider defaults).
 * Per-run execution (input, output, status, retryCount) lives in
 * `Pipeline.nodes[]`, not on this document.
 */
export enum WorkflowNodeType {
  TextGeneration = 'text_generation',
  ImageGeneration = 'image_generation',
  VideoGeneration = 'video_generation',
  Translation = 'translation',
  Transcription = 'transcription',
  Summarization = 'summarization',
}

export enum NodeOutputFormat {
  Paragraph = 'paragraph',
  Bullets = 'bullets',
  Caption = 'caption',
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

export enum LlmProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Google = 'google',
  Groq = 'groq',
  Ollama = 'ollama',
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

  @Prop({ type: String })
  sourceLanguage?: string;

  @Prop({ type: String })
  targetLanguage?: string;

  @Prop({ type: String, enum: Object.values(NodeFormalityLevel) })
  formalityLevel?: NodeFormalityLevel;

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
}

export const WorkflowNodeSchema = SchemaFactory.createForClass(WorkflowNode);
export type WorkflowNodeDocument = HydratedDocument<WorkflowNode>;

WorkflowNodeSchema.index({ workflowRef: 1, order: 1 });
