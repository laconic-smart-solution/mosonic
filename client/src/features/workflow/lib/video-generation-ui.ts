export type VideoGenerationMode = "presenter" | "cinematic"

/** When true, users can choose HeyGen cinematic vs HeyGen presenter on video nodes. */
export const VIDEO_CINEMATIC_UI_ENABLED = true

/** Canvas types for the split video nodes. `video` is the legacy single-node type. */
export const VIDEO_PRESENTER_CANVAS = "video_presenter"
export const VIDEO_CINEMATIC_CANVAS = "video_cinematic"
const VIDEO_CANVAS_TYPES = new Set<string>([
  VIDEO_PRESENTER_CANVAS,
  VIDEO_CINEMATIC_CANVAS,
  "video",
])

/** Backend node types that produce a video (split types + legacy `video_generation`). */
export const VIDEO_BACKEND_TYPES = [
  "video_presenter",
  "video_cinematic",
  "video_generation",
] as const
const VIDEO_BACKEND_SET = new Set<string>(VIDEO_BACKEND_TYPES)

export function isVideoCanvasType(t: string | null | undefined): boolean {
  return !!t && VIDEO_CANVAS_TYPES.has(t)
}

export function isVideoBackendType(t: string | null | undefined): boolean {
  return !!t && VIDEO_BACKEND_SET.has(t)
}

export function effectiveVideoMode(
  config: Record<string, unknown> | undefined,
  type?: string | null,
): VideoGenerationMode {
  if (type === VIDEO_PRESENTER_CANVAS) return "presenter"
  if (type === VIDEO_CINEMATIC_CANVAS) return "cinematic"
  if (!VIDEO_CINEMATIC_UI_ENABLED) return "presenter"
  const mode = config?.mode
  return mode === "presenter" ? "presenter" : "cinematic"
}

/** Canvas type for a video mode (legacy nodes are split by `config.mode`). */
export function videoCanvasTypeForMode(mode: VideoGenerationMode): string {
  return mode === "presenter" ? VIDEO_PRESENTER_CANVAS : VIDEO_CINEMATIC_CANVAS
}
