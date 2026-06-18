import type { ReactFlowInstance, Viewport } from "@xyflow/react"

export const WORKFLOW_CANVAS_VIEWPORT_STORAGE_KEY =
  "nt.workflow.canvasViewport"

export const WORKFLOW_CANVAS_MIN_ZOOM = 0.35
export const WORKFLOW_CANVAS_MAX_ZOOM = 1.5

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

function clampZoom(zoom: number): number {
  return Math.min(WORKFLOW_CANVAS_MAX_ZOOM, Math.max(WORKFLOW_CANVAS_MIN_ZOOM, zoom))
}

function isValidViewport(value: unknown): value is Viewport {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Viewport>
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    typeof candidate.zoom === "number" &&
    Number.isFinite(candidate.zoom)
  )
}

export function readWorkflowCanvasViewport(): Viewport | null {
  if (typeof localStorage === "undefined") return null
  try {
    const raw = localStorage.getItem(WORKFLOW_CANVAS_VIEWPORT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidViewport(parsed)) return null
    return {
      x: parsed.x,
      y: parsed.y,
      zoom: clampZoom(parsed.zoom),
    }
  } catch {
    return null
  }
}

export function writeWorkflowCanvasViewport(viewport: Viewport): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(
      WORKFLOW_CANVAS_VIEWPORT_STORAGE_KEY,
      JSON.stringify({
        x: viewport.x,
        y: viewport.y,
        zoom: clampZoom(viewport.zoom),
      }),
    )
  } catch {
    // ignore quota / private browsing
  }
}

export function defaultWorkflowCanvasViewport(): Viewport {
  return readWorkflowCanvasViewport() ?? DEFAULT_VIEWPORT
}

/** Restore saved pan/zoom or fit the graph when nothing is stored yet. */
export function applyWorkflowCanvasViewport(
  inst: Pick<ReactFlowInstance, "setViewport" | "fitView">,
): void {
  const saved = readWorkflowCanvasViewport()
  if (saved) {
    inst.setViewport(saved)
    return
  }
  void inst.fitView({ padding: 0.15 })
}
