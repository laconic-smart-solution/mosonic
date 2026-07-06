import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import { mergeParsedIntoPreviousOutputs } from '../pipeline/pipeline-output-merge.util';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import {
  parsePipelineGraph,
  parsePipelineNodes,
} from '../repositories/prisma/pipeline-nodes.util';
import {
  getAncestorsForLane,
  topologicalSort,
  type WorkflowGraphEdge,
} from '../workflow/workflow-graph.util';
import type {
  NodeOutputMap,
  NodeUserEditMap,
} from './content-node-output.util';

function mergeNodeLayers(
  nodeOutputs: NodeOutputMap,
  nodeUserEdits: NodeUserEditMap,
  nodeId: string,
): Record<string, unknown> {
  return {
    ...(nodeOutputs[nodeId] ?? {}),
    ...(nodeUserEdits[nodeId] ?? {}),
  };
}

/** Lane-aware upstream context for content re-run (matches pipeline execution). */
export function buildContentRerunPreviousOutputs(
  pipeline: PipelineRecord,
  targetNodeId: string,
  nodeOutputs: NodeOutputMap,
  nodeUserEdits: NodeUserEditMap,
): PreviousOutputs {
  const nodes = parsePipelineNodes(pipeline.nodes);
  const graph = parsePipelineGraph(pipeline.graph);
  const edges: WorkflowGraphEdge[] = graph.edges ?? [];
  const target = nodes.find((n) => n.nodeId === targetNodeId);
  const nodesById = new Map(
    nodes.map((n) => [n.nodeId, { nodeId: n.nodeId, lane: n.lane ?? null }]),
  );
  const ancestors = getAncestorsForLane(
    edges,
    targetNodeId,
    target?.lane ?? null,
    nodesById,
  );
  const ancestorIds = topologicalSort([...ancestors], edges);
  const previousOutputs: PreviousOutputs = {};

  for (const ancestorId of ancestorIds) {
    const layer = mergeNodeLayers(nodeOutputs, nodeUserEdits, ancestorId);
    if (Object.keys(layer).length > 0) {
      mergeParsedIntoPreviousOutputs(previousOutputs, layer);
      continue;
    }
    const node = nodes.find((n) => n.nodeId === ancestorId);
    if (!node) continue;
    const parsed = parsePipelineNodeOutputString(node.output ?? null);
    if (parsed) {
      mergeParsedIntoPreviousOutputs(previousOutputs, parsed);
    }
  }

  return previousOutputs;
}
