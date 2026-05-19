export type { WorkflowGraphEdge } from '../workflow/workflow-graph.util';
export {
  areAllDependenciesMet,
  buildLinearEdgesFromOrder,
  getAncestors,
  getIncoming,
  getOutgoing,
  getRoots,
  topologicalSort,
} from '../workflow/workflow-graph.util';

/** @deprecated Use buildLinearEdgesFromOrder */
export { buildLinearEdgesFromOrder as buildLinearEdges } from '../workflow/workflow-graph.util';
