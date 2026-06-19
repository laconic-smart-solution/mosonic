/** Admin-managed workflow node types with default reference USD cost per run. */
export const BILLABLE_NODE_CREDIT_DEFAULTS: ReadonlyArray<{
  nodeType: string;
  costUsd: number;
}> = [
  { nodeType: 'keyword_planner', costUsd: 0.01 },
  { nodeType: 'intelligence', costUsd: 0.01 },
  { nodeType: 'text_generation', costUsd: 0.01 },
  { nodeType: 'adapt', costUsd: 0.008 },
  { nodeType: 'transcription', costUsd: 0.006 },
  { nodeType: 'summarization', costUsd: 0.006 },
  { nodeType: 'translation', costUsd: 0.008 },
  { nodeType: 'image_generation', costUsd: 0.04 },
  { nodeType: 'video_generation', costUsd: 0.48 },
] as const;

const BILLABLE_NODE_TYPES = new Set(
  BILLABLE_NODE_CREDIT_DEFAULTS.map((row) => row.nodeType),
);

export function isBillableNodeCreditType(nodeType: string): boolean {
  return BILLABLE_NODE_TYPES.has(nodeType);
}

export function defaultCostUsdForNodeType(nodeType: string): number | null {
  const row = BILLABLE_NODE_CREDIT_DEFAULTS.find((r) => r.nodeType === nodeType);
  return row?.costUsd ?? null;
}
