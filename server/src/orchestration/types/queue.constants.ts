export const QUEUES = {
  PIPELINE_NODES: 'pipeline_nodes',
  PIPELINE_NODES_DLQ: 'pipeline_nodes_dlq',
  /** @deprecated Drain only — video uses VIDEO_GENERATE + VIDEO_CHECK */
  PIPELINE_NODES_VIDEO: 'pipeline_nodes_video',
  VIDEO_GENERATE: 'video_generate',
  VIDEO_CHECK: 'video_check',
} as const;

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const POLL_CONFIG = {
  video: {
    initialDelayMs: envInt('VIDEO_POLL_INITIAL_DELAY_MS', 60_000),
    intervalMs: envInt('VIDEO_POLL_INTERVAL_MS', 30_000),
    maxChecks: envInt('VIDEO_POLL_MAX_CHECKS', 58),
    timeoutLabel: 'Video generation timed out after 30 minutes',
  },
} as const;

/** Unique BullMQ job id for a video check attempt. */
export function videoCheckJobId(
  pipelineId: string,
  nodeId: string,
  checkCount: number,
): string {
  return `${pipelineId}__${nodeId}__check__${checkCount}`;
}
