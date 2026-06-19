import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import {
  WorkflowEdgeEntry,
  WorkflowEdgeEntrySchema,
} from '../../workflow/schemas/workflow-edge.schema';

/** Pipeline-level lifecycle (orchestration run). */
export enum PipelineStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Paused = 'paused',
}

/** Per-node execution state inside a pipeline run. */
export enum PipelineNodeExecutionStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

export enum PipelineExecutionMode {
  Inline = 'inline',
  Queue = 'queue',
}

/**
 * One workflow node’s runtime row inside a pipeline (input/output, retries).
 * Contrasts with `WorkflowNode`, which stores definition/template only.
 */
@Schema({ _id: false })
export class PipelineNodeExecution {
  @Prop({ type: String, required: true })
  nodeId: string;

  @Prop({
    type: String,
    enum: Object.values(WorkflowNodeType),
    required: true,
  })
  type: WorkflowNodeType;

  @Prop({ required: true, min: 0 })
  order: number;

  @Prop({ type: Boolean, required: true, default: false })
  isLocked: boolean;

  @Prop({ type: String, default: '' })
  userPrompt: string;

  @Prop({ type: Object, default: {} })
  config: Record<string, unknown>;

  @Prop({
    type: String,
    enum: Object.values(PipelineNodeExecutionStatus),
    required: true,
    default: PipelineNodeExecutionStatus.Pending,
  })
  status: PipelineNodeExecutionStatus;

  /** Serialized context passed into the model/provider for this step. */
  @Prop({ type: String, default: '' })
  input: string;

  /** Model output (text, URL, JSON string, etc.); null until success or partial. */
  @Prop({ type: String, default: null })
  output: string | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  retryCount: number;

  @Prop({ type: Date, default: null })
  executedAt: Date | null;

  /** Channel lane key after branch materialization; null = shared trunk. */
  @Prop({ type: String, default: null })
  lane: string | null;

  @Prop({ type: String, default: null })
  variantId: string | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  /** OpenAI Sora (or other provider) job id while async generation is in flight. */
  @Prop({ type: String, default: null })
  externalJobId: string | null;
}
export const PipelineNodeExecutionSchema = SchemaFactory.createForClass(
  PipelineNodeExecution,
);

/** Immutable workflow graph captured at pipeline start. */
@Schema({ _id: false })
export class PipelineGraphSnapshot {
  @Prop({ type: [WorkflowEdgeEntrySchema], default: [] })
  edges: WorkflowEdgeEntry[];

  @Prop({ type: Number })
  materializedFromWorkflowVersion?: number;

  @Prop({ type: [String], default: [] })
  lanes: string[];

  /** Materialized nodeId → canvas position from workflow template at pipeline start. */
  @Prop({ type: Object, default: () => ({}) })
  layout: Record<string, { x: number; y: number }>;
}

export const PipelineGraphSnapshotSchema = SchemaFactory.createForClass(
  PipelineGraphSnapshot,
);

/** Ephemeral rule tweaks for one pipeline run (analytics learnings). */
@Schema({ _id: false })
export class PipelineRuleOverlay {
  @Prop({ type: Number, required: true })
  baseRuleVersion: number;

  @Prop({ type: [String], default: [] })
  appliedSuggestionIds: string[];

  @Prop({ type: [Object], default: [] })
  patches: Array<{ field: string; suggestedValue: unknown }>;

  @Prop({ type: Date, required: true })
  analyticsSnapshotAt: Date;
}

export const PipelineRuleOverlaySchema =
  SchemaFactory.createForClass(PipelineRuleOverlay);

@Schema({ _id: false })
export class PipelineNewsMeta {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  url: string;

  @Prop({ type: String, required: true })
  sourceId: string;

  @Prop({ type: String, required: true })
  publishedAt: string;

  @Prop({ type: Number, required: true })
  relevanceScore: number;

  @Prop({ type: String, default: '' })
  suggestedAngle: string;
}
export const PipelineNewsMetaSchema =
  SchemaFactory.createForClass(PipelineNewsMeta);

@Schema({ _id: false })
export class PipelineMetadata {
  @Prop({ type: String })
  source?: 'manual' | 'scheduler' | 'integration' | 'news';

  @Prop({ type: String })
  scheduleId?: string;

  @Prop({ type: String })
  experimentId?: string;

  @Prop({ type: PipelineNewsMetaSchema, default: null })
  newsMeta: PipelineNewsMeta | null;
}

export const PipelineMetadataSchema =
  SchemaFactory.createForClass(PipelineMetadata);

/** Per-node-type snapshot of credits charged up-front, used for refund reconciliation. */
@Schema({ _id: false })
export class PipelineCreditChargeEntry {
  @Prop({ type: String, required: true })
  nodeType: string;

  @Prop({ type: Number, required: true, min: 0 })
  count: number;

  @Prop({ type: Number, required: true, min: 0 })
  creditsEach: number;
}
export const PipelineCreditChargeEntrySchema = SchemaFactory.createForClass(
  PipelineCreditChargeEntry,
);

@Schema({
  collection: 'pipelines',
  timestamps: false,
})
export class Pipeline {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  pipelineId: string;

  /** App-local tenant id (`User.userId`); legacy rows may omit. */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ required: true })
  contentPrompt: string;

  /** User-visible label; defaults from content prompt or run timestamp. */
  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: [PipelineNodeExecutionSchema], default: [] })
  nodes: PipelineNodeExecution[];

  @Prop({
    type: String,
    enum: Object.values(PipelineStatus),
    required: true,
    default: PipelineStatus.Running,
  })
  status: PipelineStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  /** Node that caused the pipeline to pause (awaiting retry/skip). */
  @Prop({ type: String, default: null })
  pausedNodeId: string | null;

  /** Lane where failure occurred (for UI); null when shared trunk failed. */
  @Prop({ type: String, default: null })
  pausedLaneId: string | null;

  @Prop({
    type: String,
    enum: Object.values(PipelineExecutionMode),
    default: PipelineExecutionMode.Inline,
  })
  executionMode: PipelineExecutionMode;

  @Prop({
    type: PipelineGraphSnapshotSchema,
    default: () => ({ edges: [], lanes: [], layout: {} }),
  })
  graph: PipelineGraphSnapshot;

  /** Merged at execution time only; never auto-persisted to the rule. */
  @Prop({ type: PipelineRuleOverlaySchema, default: null })
  ruleOverlay: PipelineRuleOverlay | null;

  @Prop({ type: PipelineMetadataSchema, default: () => ({}) })
  metadata: PipelineMetadata;

  /** Credits deducted up-front when the run started. */
  @Prop({ type: Number, default: 0 })
  creditsCharged?: number;

  /** Snapshot of billable nodes charged, for refund reconciliation. */
  @Prop({ type: [PipelineCreditChargeEntrySchema], default: [] })
  creditChargeBreakdown?: PipelineCreditChargeEntry[];

  /** True once unused-node credits have been refunded (idempotency guard). */
  @Prop({ type: Boolean, default: false })
  creditsReconciled?: boolean;
}

export const PipelineSchema = SchemaFactory.createForClass(Pipeline);
export type PipelineDocument = HydratedDocument<Pipeline>;

PipelineSchema.index({ workflowRef: 1, status: 1 });
PipelineSchema.index({ ruleRef: 1, startedAt: -1 });
PipelineSchema.index({ userId: 1, startedAt: -1 });
