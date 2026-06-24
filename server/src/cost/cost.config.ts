/**
 * Rough USD per presenter script GPT rewrite (~200 input + ~100 output tokens at gpt-4o-mini).
 * Not recorded separately; monitor via ScriptDurationService logs (method=rewritten).
 */
export const SCRIPT_REWRITE_COST_ESTIMATE = 0.001;

/** OpenAI chat pricing: USD per 1M tokens. */
export const OPENAI_LLM_PRICING: Record<
  string,
  { inputPerMToken: number; outputPerMToken: number }
> = {
  'gpt-4o': { inputPerMToken: 2.5, outputPerMToken: 10.0 },
  'gpt-4o-mini': { inputPerMToken: 0.15, outputPerMToken: 0.6 },
  'gpt-4-turbo': { inputPerMToken: 10.0, outputPerMToken: 30.0 },
  'gpt-4.1': { inputPerMToken: 2.0, outputPerMToken: 8.0 },
  'gpt-4.1-mini': { inputPerMToken: 0.4, outputPerMToken: 1.6 },
};

/**
 * USD per image. Key: `${model}_${size}_${quality}` for DALL·E;
 * gpt-image-1 uses simplified keys (OpenAI pricing varies — conservative defaults).
 */
export const OPENAI_IMAGE_PRICING: Record<string, number> = {
  'dall-e-3_1024x1024_standard': 0.04,
  'dall-e-3_1024x1024_hd': 0.08,
  'dall-e-3_1792x1024_standard': 0.08,
  'dall-e-3_1792x1024_hd': 0.12,
  'dall-e-3_1024x1792_standard': 0.08,
  'dall-e-3_1024x1792_hd': 0.12,
  'dall-e-2_1024x1024_standard': 0.02,
  'dall-e-2_512x512_standard': 0.018,
  'dall-e-2_1024x1024': 0.02,
  'dall-e-2_512x512': 0.018,
  /** Fallback per image when size/quality keys are unknown */
  'gpt-image-1_default': 0.04,
};

/**
 * Video: USD per second by model and resolution (aligned with app defaults: sora-2 family).
 */
export const OPENAI_VIDEO_PRICING: Record<
  string,
  { perSecond: number; resolutions: Record<string, number> }
> = {
  'sora-2': {
    perSecond: 0.04,
    resolutions: { '480p': 0.04, '720p': 0.08, '1080p': 0.12 },
  },
  'sora-2-pro': {
    perSecond: 0.08,
    resolutions: { '480p': 0.08, '720p': 0.12, '1080p': 0.18 },
  },
  'sora-2-2025-10-06': {
    perSecond: 0.04,
    resolutions: { '480p': 0.04, '720p': 0.08, '1080p': 0.12 },
  },
  'sora-2-pro-2025-10-06': {
    perSecond: 0.08,
    resolutions: { '480p': 0.08, '720p': 0.12, '1080p': 0.18 },
  },
  'sora-2-2025-12-08': {
    perSecond: 0.04,
    resolutions: { '480p': 0.04, '720p': 0.08, '1080p': 0.12 },
  },
  /** Legacy guide name */
  sora: {
    perSecond: 0.04,
    resolutions: { '480p': 0.04, '720p': 0.08, '1080p': 0.12 },
  },
};

export const ZERNIO_ACCOUNT_MONTHLY_USD = 6.0;

/** OpenAI Whisper — USD per minute (approximate public pricing). */
export const OPENAI_WHISPER_USD_PER_MINUTE = 0.006;

/** Credit display rounding — minimum 1 credit per operation. */
export const displayCredits = (precise: number): number =>
  Math.max(1, Math.round(precise));
