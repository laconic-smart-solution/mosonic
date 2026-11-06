/** Shape sent on the chat socket as `chat:run-progress`. */
export type ChatRunStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type ChatRunStep = {
  nodeId: string;
  name: string;
  label: string;
  status: ChatRunStepStatus;
  /** Seconds the step took (done steps only, when known). */
  durationMs: number | null;
};

export type ChatRunStatus = 'running' | 'completed' | 'failed' | 'paused';

export type ChatRunProgress = {
  sessionId: string;
  pipelineId: string;
  name: string;
  status: ChatRunStatus;
  steps: ChatRunStep[];
  currentStep: string | null;
  startedAt: string;
  completedAt: string | null;
  estimatedRemainingMs: number | null;
  /** Paused / failed node, when the run stopped on one. */
  failedNodeId: string | null;
  error: string | null;
};

type SnapshotNode = {
  nodeId: string;
  type: string;
  order: number;
  lane?: string | null;
  status: string;
  executedAt?: Date | string | null;
  output?: Record<string, unknown> | null;
};

export type RunProgressSnapshot = {
  pipeline: {
    pipelineId: string;
    name?: string;
    status: string;
    pausedNodeId?: string | null;
    startedAt: Date | string;
    completedAt?: Date | string | null;
  };
  nodes: SnapshotNode[];
};

/** Typical full run when nothing has finished yet (smoke tests: 60-70s). */
export const DEFAULT_RUN_ESTIMATE_MS = 70_000;

const STEP_LABELS: Record<string, string> = {
  keyword_planner: 'Brief & keywords',
  intelligence: 'Brief & strategy',
  text_generation: 'Caption draft',
  image_generation: 'Generating images',
  video_generation: 'Generating video',
  translation: 'Translating',
  transcription: 'Transcribing',
  summarization: 'Summary',
  adapt: 'Adapting per channel',
  branch: 'Splitting channels',
  merge: 'Ready for review',
};

export function stepLabel(type: string): string {
  const key = type.toLowerCase();
  if (STEP_LABELS[key]) return STEP_LABELS[key];
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Step';
}

export function mapStepStatus(status: string): ChatRunStepStatus {
  switch (status) {
    case 'completed':
      return 'done';
    case 'skipped':
      return 'skipped';
    case 'failed':
      return 'failed';
    case 'running':
    case 'waiting_review':
      return 'running';
    default:
      return 'pending';
  }
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function mapRunStatus(status: string): ChatRunStatus {
  if (status === 'completed' || status === 'failed' || status === 'paused') {
    return status;
  }
  return 'running';
}

/**
 * Pipeline snapshot -> chat run card payload. Durations come from node
 * executedAt deltas in order; the remaining estimate averages finished steps.
 */
export function buildRunProgress(
  sessionId: string,
  snapshot: RunProgressSnapshot,
  now: number = Date.now(),
  error: string | null = null,
): ChatRunProgress {
  const ordered = [...snapshot.nodes].sort((a, b) => a.order - b.order);
  const startedAtMs = toMs(snapshot.pipeline.startedAt) ?? now;
  const status = mapRunStatus(String(snapshot.pipeline.status));

  let previousEnd = startedAtMs;
  const steps: ChatRunStep[] = ordered.map((node) => {
    const stepStatus = mapStepStatus(String(node.status));
    const executedAt = toMs(node.executedAt ?? null);
    let durationMs: number | null = null;
    if (stepStatus === 'done' && executedAt !== null) {
      durationMs = Math.max(0, executedAt - previousEnd);
      previousEnd = Math.max(previousEnd, executedAt);
    }
    return {
      nodeId: node.nodeId,
      name: String(node.type),
      label: node.lane ? `${stepLabel(String(node.type))} (${node.lane})` : stepLabel(String(node.type)),
      status: stepStatus,
      durationMs,
    };
  });

  // Nothing marked running yet: the first pending step is the current one.
  if (status === 'running' && !steps.some((s) => s.status === 'running')) {
    const next = steps.find((s) => s.status === 'pending');
    if (next) next.status = 'running';
  }

  const pausedNodeId = snapshot.pipeline.pausedNodeId ?? null;
  const failedStep =
    steps.find((s) => s.status === 'failed') ??
    (pausedNodeId && status !== 'running'
      ? steps.find((s) => s.nodeId === pausedNodeId)
      : undefined);
  if (status === 'failed' && failedStep) failedStep.status = 'failed';

  const current =
    status === 'running'
      ? (steps.find((s) => s.status === 'running') ?? null)
      : (failedStep ?? null);

  let estimatedRemainingMs: number | null = null;
  if (status === 'running') {
    const finished = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
    const remaining = steps.length - finished;
    const elapsed = Math.max(0, now - startedAtMs);
    if (finished > 0) {
      estimatedRemainingMs = Math.round((elapsed / finished) * remaining);
    } else {
      estimatedRemainingMs = Math.max(0, DEFAULT_RUN_ESTIMATE_MS - elapsed);
    }
  }

  const completedAt = toMs(snapshot.pipeline.completedAt ?? null);
  return {
    sessionId,
    pipelineId: snapshot.pipeline.pipelineId,
    name: snapshot.pipeline.name ?? 'Generation run',
    status,
    steps,
    currentStep: current?.nodeId ?? null,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt:
      completedAt !== null
        ? new Date(completedAt).toISOString()
        : status === 'completed' || status === 'failed'
          ? new Date(now).toISOString()
          : null,
    estimatedRemainingMs,
    failedNodeId: status === 'running' ? null : (failedStep?.nodeId ?? null),
    error,
  };
}

/** Tool observation fed to the follow-up turn (synthetic `pipeline_result`). */
export function buildPipelineResultObservation(args: {
  progress: ChatRunProgress;
  contentId: string | null;
  hasImage: boolean;
  error: string | null;
}): Record<string, unknown> {
  const { progress } = args;
  const ok = progress.status === 'completed';
  return {
    ok,
    action: 'pipeline_result',
    pipelineId: progress.pipelineId,
    status: progress.status,
    durationMs:
      progress.completedAt !== null
        ? new Date(progress.completedAt).getTime() - new Date(progress.startedAt).getTime()
        : null,
    steps: progress.steps.map((s) => ({ node: s.nodeId, type: s.name, status: s.status })),
    failedNodeId: progress.failedNodeId,
    contentId: args.contentId,
    hasImage: args.hasImage,
    error: args.error,
    instruction: ok
      ? args.contentId
        ? 'The generation run you started earlier just finished. The draft (get_content / show_content) is already attached in this turn — tell the user in a sentence or two that it is ready (mention if an image is missing). Do not call get_content again, and do not start another run or change anything.'
        : 'The generation run you started earlier just finished but no contentId is known yet. Call get_content (omit contentId) to load the latest draft, then tell the user in a sentence or two that it is ready. Do not start another run or change anything.'
      : 'The generation run you started earlier stopped. Explain in plain language which step failed and why, say what was kept, and offer to try again. Do not start another run yourself.',
  };
}
