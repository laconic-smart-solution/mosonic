/** Representative USD cost per operation for admin operation-weights table. */
export type OperationReferenceCost = {
  nodeType: string;
  provider: string;
  costUsd: number;
};

export const OPERATION_REFERENCE_COSTS: OperationReferenceCost[] = [
  { nodeType: 'text_generation', provider: 'openai', costUsd: 0.01 },
  { nodeType: 'translation', provider: 'openai', costUsd: 0.008 },
  { nodeType: 'summarization', provider: 'openai', costUsd: 0.006 },
  { nodeType: 'image_generation', provider: 'openai', costUsd: 0.04 },
  { nodeType: 'image_generation', provider: 'ideogram', costUsd: 0.06 },
  {
    nodeType: 'video_generation_presenter',
    provider: 'heygen',
    costUsd: 0.501,
  },
  {
    nodeType: 'video_generation_cinematic',
    provider: 'openai',
    costUsd: 0.48,
  },
  { nodeType: 'video_generation_cinematic', provider: 'runway', costUsd: 0.5 },
  { nodeType: 'transcription', provider: 'openai', costUsd: 0.006 },
];
