import { isNodeBlockedByLanePause } from './lane-pause.util';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';

describe('lane-pause.util', () => {
  const pipeline = {
    pausedLaneId: 'instagram',
    nodes: [
      { nodeId: 'a', lane: 'instagram', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'b', lane: 'facebook', status: PipelineNodeExecutionStatus.Pending },
    ],
  } as never;

  it('blocks nodes in paused lane when lane-scoped pause enabled', () => {
    expect(isNodeBlockedByLanePause(pipeline, 'a', true)).toBe(true);
    expect(isNodeBlockedByLanePause(pipeline, 'b', true)).toBe(false);
  });

  it('does not block when lane-scoped pause disabled', () => {
    expect(isNodeBlockedByLanePause(pipeline, 'a', false)).toBe(false);
  });
});
