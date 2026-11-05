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
  /** Subtitle node: output format (srt | vtt). */
  format?: 'srt' | 'vtt';
  /** Subtitle node: wrap width per caption line. */
  maxCharsPerLine?: number;
  /** Subtitle node: reserved (burn-in not implemented yet; ignored). */
  burnIn?: boolean;
  /** Subtitle node: explicit text instead of upstream transcription. */
  sourceText?: string;
  /** Subtitle node: known media duration for cue timing. */
  audioDurationSeconds?: number;
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
  /** Cinematic (HeyGen): cinematic_avatar needs a look; heygen_video does not. */
  cinematicMode?: 'cinematic_avatar' | 'heygen_video';
  heygenCinematicModel?: 'heygen_video_1' | 'seedance_2' | string;
  heygenAvatarIds?: string[];
  heygenReferenceAssetIds?: string[];
  heygenReferenceImageUrl?: string;
  /** Brand asset (rule_assets) the HeyGen look was created from. */
  heygenLookSourceRuleAssetId?: string;
  heygenVideoMode?: 'text_to_video' | 'image_to_video' | 'reference_to_video';
  enhancePrompt?: boolean;
  promptEnhancement?: 'turbo' | 'quality' | 'ultraquality' | 'disabled';
  seed?: number;
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
