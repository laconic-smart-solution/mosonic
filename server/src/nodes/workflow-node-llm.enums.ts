/**
 * Provider + node-type enums and minimal config subsets used by `LlmService`.
 * Keeps LLM bootstrap independent of mongoose schema compilation paths.
 */

export enum WorkflowNodeType {
  KeywordPlanner = 'keyword_planner',
  TextGeneration = 'text_generation',
  ImageGeneration = 'image_generation',
  /** HeyGen Photo Avatar presenter video. */
  VideoPresenter = 'video_presenter',
  /** HeyGen cinematic video (cinematic_avatar | heygen_video). */
  VideoCinematic = 'video_cinematic',
  /**
   * @deprecated Legacy combined video node (mode in config). Still executable
   * for old pipelines / snapshots; new nodes use VideoPresenter / VideoCinematic
   * and `migrateLegacyVideoNode` upgrades it on save.
   */
  VideoGeneration = 'video_generation',
  Translation = 'translation',
  Transcription = 'transcription',
  /** Local SRT/VTT from upstream transcription text (no AI call). */
  Subtitle = 'subtitle',
  Summarization = 'summarization',
  Branch = 'branch',
  Adapt = 'adapt',
  Merge = 'merge',
  Intelligence = 'intelligence',
}

export enum LlmProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Google = 'google',
  Groq = 'groq',
  Ollama = 'ollama',
}

/** Config fields read by LLM routing / capability checks (mongoose-free). */
export interface WorkflowNodeLlmConfigSubset {
  provider?: LlmProvider | string;
}
