import type { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export const PIPELINE_NODES_QUEUE = 'pipeline_nodes';
export const PIPELINE_NODES_VIDEO_QUEUE = 'pipeline_nodes_video';
export const PIPELINE_NODES_DLQ = 'pipeline_nodes_dlq';

export interface NodeJobPayload {
  pipelineId: string;
  workflowId: string;
  ruleId: string;
  userId: string;
  nodeId: string;
  nodeType: WorkflowNodeType;
  order: number;
  totalNodes: number;
  contentPrompt: string;
  lane?: string | null;
}

/** BullMQ custom job ids must not contain `:`. */
export const PIPELINE_JOB_ID_SEP = '__';

export function pipelineNodeJobId(pipelineId: string, nodeId: string): string {
  return `${pipelineId}${PIPELINE_JOB_ID_SEP}${nodeId}`;
}

export function pipelineJobIdPrefix(pipelineId: string): string {
  return `${pipelineId}${PIPELINE_JOB_ID_SEP}`;
}

export function pipelineNodeDlqJobId(parentJobId: string): string {
  return `${parentJobId}${PIPELINE_JOB_ID_SEP}dlq`;
}

export function pipelineNodeReplayJobId(
  pipelineId: string,
  nodeId: string,
): string {
  return `${pipelineId}${PIPELINE_JOB_ID_SEP}${nodeId}${PIPELINE_JOB_ID_SEP}replay`;
}
