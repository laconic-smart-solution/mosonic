import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import { parsePipelineMetadata } from '../repositories/prisma/pipeline-nodes.util';
import {
  PipelineUserExecutionMode,
  type PipelineUserExecutionMode as PipelineUserExecutionModeType,
} from '../pipeline/schemas/pipeline.schema';

export function effectiveUserExecutionMode(
  pipeline: PipelineRecord,
): PipelineUserExecutionModeType {
  const metadata = parsePipelineMetadata(pipeline.metadata);
  const source = metadata.source ?? 'manual';
  if (source !== 'manual') {
    return PipelineUserExecutionMode.Auto;
  }
  const mode = pipeline.executionMode;
  if (mode === 'step') {
    return PipelineUserExecutionMode.Step;
  }
  return PipelineUserExecutionMode.Auto;
}

export function isStepModeActive(pipeline: PipelineRecord): boolean {
  return (
    effectiveUserExecutionMode(pipeline) === PipelineUserExecutionMode.Step
  );
}
