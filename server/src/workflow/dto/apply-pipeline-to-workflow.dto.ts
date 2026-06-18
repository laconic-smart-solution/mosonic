export class ApplyPipelineToWorkflowResponseDto {
  workflowId!: string;
  contentPrompt!: string;
  nodes!: Array<{
    nodeId: string;
    type: string;
    order: number;
    isLocked: boolean;
    config: Record<string, unknown>;
    x?: number;
    y?: number;
    lane?: string | null;
  }>;
  edges!: Array<{
    from: string;
    to: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
}
