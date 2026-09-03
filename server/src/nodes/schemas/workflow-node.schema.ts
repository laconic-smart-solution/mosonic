import { LlmProvider, WorkflowNodeType } from '../workflow-node-llm.enums';

export { WorkflowNodeType, LlmProvider } from '../workflow-node-llm.enums';

export enum NodeOutputFormat {
  Paragraph = 'paragraph',
  Bullets = 'bullets',
  Caption = 'caption',
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

export enum NodeImageTemplate {
  Auto = 'auto',
  AdCreative = 'ad_creative',
  ProductMockup = 'product_mockup',
  Infographic = 'infographic',
  Photorealistic = 'photorealistic',
  Lifestyle = 'lifestyle',
}

export enum NodeAspectRatio {
  R16x9 = '16:9',
  R9x16 = '9:16',
  R1x1 = '1:1',
  R4x5 = '4:5',
}

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

export interface WorkflowNodeConfig {
  provider?: LlmProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: NodeOutputFormat;
  tone?: NodeTextTone;
  textLength?: NodeSummaryLength;
  size?: string;
  quality?: NodeImageQuality;
  style?: NodeImageStyle;
  template?: NodeImageTemplate;
  /** Design style key from `image_design_styles`, or "auto" to let ImageStyleSelectorService pick one. */
  designStyle?: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: NodeAspectRatio;
  negativePrompt?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  formalityLevel?: NodeFormalityLevel;
  preserveFormatting?: boolean;
  sourceType?: NodeMediaSourceType;
  sourceUrl?: string;
  language?: string;
  summaryLength?: NodeSummaryLength;
  sourceNodeRef?: string;
  mode?: string;
  channel?: string;
  contentStyle?: string;
  searchType?: string;
  customPrompt?: string | null;
  laneId?: string;
  heygenAvatarId?: string;
  heygenAvatarAssetId?: string;
  heygenAvatarPhotoUrl?: string;
  heygenBackgroundAssetId?: string;
  heygenBackgroundUrl?: string;
  heygenVoiceId?: string;
  heygenOrientation?: string;
  heygenExpressiveness?: string;
  heygenMotionPrompt?: string;
  removeBackground?: boolean;
}

export interface WorkflowNode {
  nodeId: string;
  workflowRef: string;
  userId?: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt?: string;
  config: WorkflowNodeConfig;
  lane?: string;
  x?: number;
  y?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WorkflowNodeDocument = WorkflowNode;
