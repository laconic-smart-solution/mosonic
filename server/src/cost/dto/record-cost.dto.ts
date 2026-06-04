import type { CostEntryType } from '../schemas/cost-entry.schema';

/** Internal payload for persisting a cost row (not exposed as a public HTTP body). */
export class RecordCostDto {
  userId!: string;
  pipelineRef!: string;
  /** Rule id (stored as campaignRef in Mongo). */
  campaignRef!: string;
  contentRef?: string;
  nodeId?: string;
  nodeType?: string;
  provider!: string;
  providerModel?: string;
  entryType!: CostEntryType;

  inputTokens?: number;
  outputTokens?: number;

  imageCount?: number;
  imageSize?: string;
  imageQuality?: string;

  videoSeconds?: number;
  videoResolution?: string;

  accountCount?: number;

  /** Estimated source audio/video length in seconds (Whisper pricing). */
  audioDurationSeconds?: number;

  /** When set, skips `calculateCost` (e.g. transcription heuristics). */
  costUsdOverride?: number;
}
