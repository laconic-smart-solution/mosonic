const STORAGE_KEY = "mosonic:pipelineExecutionMode"

export type PipelineUserExecutionMode = "auto" | "step"

export function readStoredPipelineExecutionMode(): PipelineUserExecutionMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === "step" ? "step" : "auto"
  } catch {
    return "auto"
  }
}

export function writeStoredPipelineExecutionMode(mode: PipelineUserExecutionMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}
