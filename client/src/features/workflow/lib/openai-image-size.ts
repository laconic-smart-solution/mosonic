/**
 * OpenAI Images API size rules by model (canvas / save-time normalization).
 * Keep in sync with `server/src/nodes/openai-image-size.util.ts`.
 */

export const GPT_STYLE_IMAGE_API_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto",
] as const

export const DALLE_3_IMAGE_API_SIZES = [
  "1024x1024",
  "1792x1024",
  "1024x1792",
] as const

const DALLE_2_SIZES = ["256x256", "512x512", "1024x1024"] as const

export function allowedOpenAiImageSizesForModel(
  model: string,
): readonly string[] {
  const m = (model ?? "").trim()
  if (m === "dall-e-2") return DALLE_2_SIZES
  if (m === "dall-e-3") return DALLE_3_IMAGE_API_SIZES
  return GPT_STYLE_IMAGE_API_SIZES
}

export function isValidOpenAiImageSizeForModel(
  size: string,
  model: string,
): boolean {
  return allowedOpenAiImageSizesForModel(model).includes(size.trim())
}

export function aspectRatioToOpenAiImageSize(
  aspectRatio: string | undefined,
  model: string,
): string {
  const m = (model ?? "").trim()
  if (m === "dall-e-2") {
    return "1024x1024"
  }
  if (m === "dall-e-3") {
    switch (aspectRatio) {
      case "16:9":
        return "1792x1024"
      case "9:16":
      case "4:5":
        return "1024x1792"
      case "1:1":
      default:
        return "1024x1024"
    }
  }
  switch (aspectRatio) {
    case "16:9":
      return "1536x1024"
    case "9:16":
    case "4:5":
      return "1024x1536"
    case "1:1":
    default:
      return "1024x1024"
  }
}

export function coerceOpenAiImageSize(
  size: string | undefined,
  model: string,
): string {
  const m = (model ?? "gpt-image-1").trim() || "gpt-image-1"
  const s = (size ?? "").trim()
  if (s && isValidOpenAiImageSizeForModel(s, m)) {
    return s
  }
  if (m !== "dall-e-3" && m !== "dall-e-2") {
    if (s === "1792x1024") return "1536x1024"
    if (s === "1024x1792") return "1024x1536"
  }
  return "1024x1024"
}

export type NormalizeImageCanvasConfigResult = {
  config: Record<string, unknown>
  /** True when an explicit invalid `size` was replaced for the model. */
  sizeAdjusted: boolean
}

/** Aligns image node config with OpenAI Images API limits before persisting. */
export function normalizeImageCanvasConfig(
  config: Record<string, unknown>,
): NormalizeImageCanvasConfigResult {
  const model =
    typeof config.model === "string" && config.model.trim()
      ? config.model.trim()
      : "gpt-image-1"
  const ar =
    typeof config.aspectRatio === "string" && config.aspectRatio.trim()
      ? config.aspectRatio.trim()
      : undefined
  const prevExplicit =
    typeof config.size === "string" && config.size.trim()
      ? config.size.trim()
      : undefined

  let basis: string
  if (ar) {
    basis = aspectRatioToOpenAiImageSize(ar, model)
  } else if (prevExplicit) {
    basis = prevExplicit
  } else {
    basis = aspectRatioToOpenAiImageSize("1:1", model)
  }
  const nextSize = coerceOpenAiImageSize(basis, model)
  const sizeAdjusted = Boolean(
    prevExplicit &&
      !isValidOpenAiImageSizeForModel(prevExplicit, model) &&
      prevExplicit !== nextSize,
  )
  return {
    config: { ...config, model, size: nextSize },
    sizeAdjusted,
  }
}
