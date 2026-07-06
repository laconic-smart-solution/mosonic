import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import { effectiveUserExecutionMode } from './pipeline-user-execution-mode.util';
import { PipelineUserExecutionMode } from '../pipeline/schemas/pipeline.schema';

function pipeline(
  overrides: Partial<PipelineRecord> & {
    metadata?: Record<string, unknown> | string | null;
  } = {},
): PipelineRecord {
  return {
    executionMode: PipelineUserExecutionMode.Step,
    metadata: { source: 'manual' },
    ...overrides,
  } as PipelineRecord;
}

describe('effectiveUserExecutionMode', () => {
  it('returns step for manual pipeline with step mode', () => {
    expect(effectiveUserExecutionMode(pipeline())).toBe(
      PipelineUserExecutionMode.Step,
    );
  });

  it('returns auto for manual pipeline with auto mode', () => {
    expect(
      effectiveUserExecutionMode(
        pipeline({ executionMode: PipelineUserExecutionMode.Auto }),
      ),
    ).toBe(PipelineUserExecutionMode.Auto);
  });

  it('forces auto for scheduler runs', () => {
    expect(
      effectiveUserExecutionMode(
        pipeline({
          executionMode: PipelineUserExecutionMode.Step,
          metadata: { source: 'scheduler' },
        }),
      ),
    ).toBe(PipelineUserExecutionMode.Auto);
  });

  it('forces auto for news runs', () => {
    expect(
      effectiveUserExecutionMode(
        pipeline({
          executionMode: PipelineUserExecutionMode.Step,
          metadata: { source: 'news' },
        }),
      ),
    ).toBe(PipelineUserExecutionMode.Auto);
  });

  it('forces auto for integration runs', () => {
    expect(
      effectiveUserExecutionMode(
        pipeline({
          executionMode: PipelineUserExecutionMode.Step,
          metadata: { source: 'integration' },
        }),
      ),
    ).toBe(PipelineUserExecutionMode.Auto);
  });
});
