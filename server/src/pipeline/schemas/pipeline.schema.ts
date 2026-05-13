import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

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
}
export const PipelineNodeExecutionSchema = SchemaFactory.createForClass(
  PipelineNodeExecution,
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
}

export const PipelineSchema = SchemaFactory.createForClass(Pipeline);
export type PipelineDocument = HydratedDocument<Pipeline>;

PipelineSchema.index({ workflowRef: 1, status: 1 });
PipelineSchema.index({ ruleRef: 1, startedAt: -1 });
PipelineSchema.index({ userId: 1, startedAt: -1 });
