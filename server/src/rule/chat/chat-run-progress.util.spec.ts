import {
  buildPipelineResultObservation,
  buildRunProgress,
  DEFAULT_RUN_ESTIMATE_MS,
  mapStepStatus,
  stepLabel,
} from './chat-run-progress.util';

const T0 = new Date('2026-11-02T09:00:00.000Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function snapshot(status: string, nodes: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    pipeline: { pipelineId: 'p1', name: 'Launch', status, startedAt: T0, completedAt: null, pausedNodeId: null, ...extra },
    nodes: nodes as never,
  };
}

describe('chat-run-progress.util', () => {
  it('maps node statuses and labels', () => {
    expect(mapStepStatus('completed')).toBe('done');
    expect(mapStepStatus('waiting_review')).toBe('running');
    expect(mapStepStatus('pending')).toBe('pending');
    expect(mapStepStatus('failed')).toBe('failed');
    expect(stepLabel('image_generation')).toBe('Generating images');
    expect(stepLabel('some_new_type')).toBe('Some new type');
  });

  it('orders steps, computes durations, current step and remaining time', () => {
    const p = buildRunProgress(
      's1',
      snapshot('running', [
        { nodeId: 'c', type: 'image_generation', order: 3, status: 'running' },
        { nodeId: 'a', type: 'keyword_planner', order: 1, status: 'completed', executedAt: at(8) },
        { nodeId: 'b', type: 'text_generation', order: 2, status: 'completed', executedAt: at(22) },
        { nodeId: 'd', type: 'translation', order: 4, status: 'pending' },
      ]),
      at(30).getTime(),
    );
    expect(p.steps.map((s) => s.nodeId)).toEqual(['a', 'b', 'c', 'd']);
    expect(p.steps[0].durationMs).toBe(8000);
    expect(p.steps[1].durationMs).toBe(14000);
    expect(p.currentStep).toBe('c');
    // 30s for 2 done steps -> 15s each, 2 left
    expect(p.estimatedRemainingMs).toBe(30000);
    expect(p.status).toBe('running');
    expect(p.completedAt).toBeNull();
  });

  it('marks the first pending step as current when nothing is running yet', () => {
    const p = buildRunProgress(
      's1',
      snapshot('running', [
        { nodeId: 'a', type: 'text_generation', order: 1, status: 'pending' },
        { nodeId: 'b', type: 'image_generation', order: 2, status: 'pending' },
      ]),
      at(10).getTime(),
    );
    expect(p.currentStep).toBe('a');
    expect(p.steps[0].status).toBe('running');
    expect(p.estimatedRemainingMs).toBe(DEFAULT_RUN_ESTIMATE_MS - 10000);
  });

  it('reports the failing step and error on a failed run', () => {
    const p = buildRunProgress(
      's1',
      snapshot('failed', [
        { nodeId: 'a', type: 'text_generation', order: 1, status: 'completed', executedAt: at(5) },
        { nodeId: 'b', type: 'image_generation', order: 2, status: 'failed' },
      ]),
      at(40).getTime(),
      'Image service timed out',
    );
    expect(p.status).toBe('failed');
    expect(p.failedNodeId).toBe('b');
    expect(p.currentStep).toBe('b');
    expect(p.error).toBe('Image service timed out');
    expect(p.estimatedRemainingMs).toBeNull();
    expect(p.completedAt).not.toBeNull();
  });

  it('uses the paused node as the failing step when the run is paused', () => {
    const p = buildRunProgress(
      's1',
      snapshot('paused', [{ nodeId: 'a', type: 'image_generation', order: 1, status: 'pending' }], { pausedNodeId: 'a' }),
    );
    expect(p.failedNodeId).toBe('a');
  });

  it('builds the pipeline_result observation', () => {
    const progress = buildRunProgress(
      's1',
      snapshot('completed', [{ nodeId: 'a', type: 'text_generation', order: 1, status: 'completed', executedAt: at(9) }], { completedAt: at(64) }),
    );
    const obs = buildPipelineResultObservation({ progress, contentId: 'c1', hasImage: false, error: null });
    expect(obs).toMatchObject({ ok: true, action: 'pipeline_result', pipelineId: 'p1', contentId: 'c1', hasImage: false, durationMs: 64000 });
    expect(String(obs.instruction)).toMatch(/get_content/);
  });
});
