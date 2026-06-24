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

export type VideoPollProvider = 'sora' | 'heygen';

export const POLL_CONFIG = {
  video: {
    minInitialDelayMs: envInt('VIDEO_POLL_MIN_INITIAL_DELAY_MS', 15_000),
    maxInitialDelayMs: envInt('VIDEO_POLL_MAX_INITIAL_DELAY_MS', 120_000),
    /** @deprecated Use min/max via computeVideoInitialDelayMs */
    initialDelayMs: envInt('VIDEO_POLL_INITIAL_DELAY_MS', 15_000),
    intervalMs: envInt('VIDEO_POLL_INTERVAL_MS', 10_000),
    maxChecks: envInt('VIDEO_POLL_MAX_CHECKS', 180),
    timeoutLabel: 'Video generation timed out after 30 minutes',
  },
  heygen: {
    minInitialDelayMs: envInt('HEYGEN_POLL_MIN_INITIAL_DELAY_MS', 10_000),
    maxInitialDelayMs: envInt('HEYGEN_POLL_MAX_INITIAL_DELAY_MS', 30_000),
    intervalMs: envInt(
      'HEYGEN_POLL_INTERVAL_MS',
      envInt('VIDEO_POLL_INTERVAL_MS', 10_000),
    ),
  },
} as const;

/** First status poll delay — avoids the old Math.max(..., 60_000) floor that blocked short clips. */
export function computeVideoInitialDelayMs(
  provider: VideoPollProvider,
  estimatedSeconds?: number,
): number {
  if (provider === 'heygen') {
    const est = estimatedSeconds ?? 30;
    return Math.min(
      POLL_CONFIG.heygen.maxInitialDelayMs,
      Math.max(
        POLL_CONFIG.heygen.minInitialDelayMs,
        Math.round(est * 1000 * 0.4),
      ),
    );
  }
  const est = estimatedSeconds ?? 60;
  return Math.min(
    POLL_CONFIG.video.maxInitialDelayMs,
    Math.max(
      POLL_CONFIG.video.minInitialDelayMs,
      Math.round(est * 1000 * 0.8),
    ),
  );
}

export function videoPollIntervalMs(provider: VideoPollProvider): number {
  return provider === 'heygen'
    ? POLL_CONFIG.heygen.intervalMs
    : POLL_CONFIG.video.intervalMs;
}

/** Unique BullMQ job id for a video check attempt. */
export function videoCheckJobId(
  pipelineId: string,
  nodeId: string,
  checkCount: number,
): string {
  return `${pipelineId}__${nodeId}__check__${checkCount}`;
}
