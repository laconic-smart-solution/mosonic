import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { WorkflowNodeConfig } from '../../nodes/schemas/workflow-node.schema';
import { getVideoGenerationMode } from '../../nodes/services/video-generation.service';
import {
  VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE,
  VIDEO_GENERATION_PRESENTER_CREDIT_TYPE,
} from './billable-node-credit-types';

export function resolveVideoCreditNodeType(
  config: Record<string, unknown> | undefined,
): string {
  return getVideoGenerationMode(config as WorkflowNodeConfig) === 'presenter'
    ? VIDEO_GENERATION_PRESENTER_CREDIT_TYPE
    : VIDEO_GENERATION_CINEMATIC_CREDIT_TYPE;
}

export function resolveCreditNodeTypeForPipelineNode(
  nodeType: string,
  config: Record<string, unknown> | undefined,
): string {
  if (nodeType === WorkflowNodeType.VideoGeneration) {
    return resolveVideoCreditNodeType(config);
  }
  return nodeType;
}
