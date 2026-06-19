export const RULE_GENERATION_NODE_TYPE = 'rule_generation' as const;
export const WORKFLOW_GENERATION_NODE_TYPE = 'workflow_generation' as const;

/** Flat-fee generation ops — not tied to pipeline node completion / refund logic. */
export const GENERATION_CREDIT_NODE_TYPES = new Set<string>([
  RULE_GENERATION_NODE_TYPE,
  WORKFLOW_GENERATION_NODE_TYPE,
]);

/** Admin-managed billable operations with default reference USD cost per run. */
export const BILLABLE_NODE_CREDIT_DEFAULTS: ReadonlyArray<{
  nodeType: string;
  costUsd: number;
}> = [
  { nodeType: RULE_GENERATION_NODE_TYPE, costUsd: 0.02 },
  { nodeType: WORKFLOW_GENERATION_NODE_TYPE, costUsd: 0.03 },
  { nodeType: 'keyword_planner', costUsd: 0.01 },
  { nodeType: 'intelligence', costUsd: 0.01 },
  { nodeType: 'text_generation', costUsd: 0.01 },
  { nodeType: 'adapt', costUsd: 0.008 },
  { nodeType: 'transcription', costUsd: 0.006 },
  { nodeType: 'summarization', costUsd: 0.006 },
  { nodeType: 'translation', costUsd: 0.008 },
  { nodeType: 'image_generation', costUsd: 0.04 },
  { nodeType: 'video_generation', costUsd: 0.48 },
  { nodeType: 'social_account_connect', costUsd: 0.001 },
] as const;

export const SOCIAL_ACCOUNT_CONNECT_NODE_TYPE = 'social_account_connect' as const;

/** Previous default before social unlock cost reduction (used for one-time DB migration). */
export const SOCIAL_ACCOUNT_CONNECT_LEGACY_COST_USD = 0.01;

const BILLABLE_NODE_TYPES = new Set(
  BILLABLE_NODE_CREDIT_DEFAULTS.map((row) => row.nodeType),
);

export function isBillableNodeCreditType(nodeType: string): boolean {
  return BILLABLE_NODE_TYPES.has(nodeType);
}

export function isPipelineNodeCreditType(nodeType: string): boolean {
  return (
    isBillableNodeCreditType(nodeType) &&
    !GENERATION_CREDIT_NODE_TYPES.has(nodeType)
  );
}

export function defaultCostUsdForNodeType(nodeType: string): number | null {
  const row = BILLABLE_NODE_CREDIT_DEFAULTS.find((r) => r.nodeType === nodeType);
  return row?.costUsd ?? null;
}
