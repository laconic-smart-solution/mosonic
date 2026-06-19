export type VideoGenerationMode = "presenter" | "cinematic"

/** When true, users can choose Sora cinematic vs HeyGen presenter on video nodes. */
export const VIDEO_CINEMATIC_UI_ENABLED = true

export function effectiveVideoMode(
  config: Record<string, unknown> | undefined,
): VideoGenerationMode {
  if (!VIDEO_CINEMATIC_UI_ENABLED) return "presenter"
  const mode = config?.mode
  return mode === "presenter" ? "presenter" : "cinematic"
}
