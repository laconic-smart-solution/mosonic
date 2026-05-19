/**
 * Provider + node-type enums and minimal config subsets used by `LlmService`.
 * Keeps LLM bootstrap independent of mongoose schema compilation paths.
 */

export enum WorkflowNodeType {
  KeywordPlanner = 'keyword_planner',
  TextGeneration = 'text_generation',
  ImageGeneration = 'image_generation',
  VideoGeneration = 'video_generation',
  Translation = 'translation',
  Transcription = 'transcription',
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
