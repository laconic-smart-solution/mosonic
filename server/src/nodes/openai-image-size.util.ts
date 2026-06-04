/**
 * OpenAI Images API size rules differ by model.
 * Keep in sync with `client/src/features/workflow/lib/openai-image-size.ts`.
 *
 * @see https://platform.openai.com/docs/api-reference/images/create
 */

/** Sizes accepted by `gpt-image-1` and similar current OpenAI image models. */
export const GPT_STYLE_IMAGE_API_SIZES = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  'auto',
] as const;

/** DALL·E 3 historical sizes (still valid when `model === "dall-e-3"`). */
export const DALLE_3_IMAGE_API_SIZES = [
  '1024x1024',
  '1792x1024',
  '1024x1792',
] as const;

const DALLE_2_SIZES = ['256x256', '512x512', '1024x1024'] as const;

export function allowedOpenAiImageSizesForModel(
  model: string,
): readonly string[] {
  const m = (model ?? '').trim();
  if (m === 'dall-e-2') return DALLE_2_SIZES;
  if (m === 'dall-e-3') return DALLE_3_IMAGE_API_SIZES;
  return GPT_STYLE_IMAGE_API_SIZES;
}

export function isValidOpenAiImageSizeForModel(
  size: string,
  model: string,
): boolean {
  const s = size.trim();
  return allowedOpenAiImageSizesForModel(model).includes(s);
}

/**
 * Maps UI aspect presets to an API `size` for the given model.
 * Non–DALL·E 3 models use the newer 1024-based geometry only.
 */
export function aspectRatioToOpenAiImageSize(
  aspectRatio: string | undefined,
  model: string,
): string {
  const m = (model ?? '').trim();
  if (m === 'dall-e-2') {
    return '1024x1024';
  }
  if (m === 'dall-e-3') {
    switch (aspectRatio) {
      case '16:9':
        return '1792x1024';
      case '9:16':
      case '4:5':
        return '1024x1792';
      case '1:1':
      default:
        return '1024x1024';
    }
  }
  switch (aspectRatio) {
    case '16:9':
      return '1536x1024';
    case '9:16':
    case '4:5':
      return '1024x1536';
    case '1:1':
    default:
      return '1024x1024';
  }
}

/** Returns a size that is always accepted by the Images API for `model`. */
export function coerceOpenAiImageSize(
  size: string | undefined,
  model: string,
): string {
  const m = (model ?? 'gpt-image-1').trim() || 'gpt-image-1';
  const s = (size ?? '').trim();
  if (s && isValidOpenAiImageSizeForModel(s, m)) {
    return s;
  }
  if (m !== 'dall-e-3' && m !== 'dall-e-2') {
    if (s === '1792x1024') return '1536x1024';
    if (s === '1024x1792') return '1024x1536';
  }
  return '1024x1024';
}
