export type VideoGenerationMode = "presenter" | "cinematic"

/** Set to true to restore Sora cinematic mode toggle and fields in the UI. */
export const VIDEO_CINEMATIC_UI_ENABLED = false

export function effectiveVideoMode(
  config: Record<string, unknown> | undefined,
): VideoGenerationMode {
  if (!VIDEO_CINEMATIC_UI_ENABLED) return "presenter"
  const mode = config?.mode
  return mode === "presenter" ? "presenter" : "cinematic"
}
