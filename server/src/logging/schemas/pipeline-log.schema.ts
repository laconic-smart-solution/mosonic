import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export enum LogLevel {
  Info = 'INFO',
  Warning = 'WARNING',
  Error = 'ERROR',
}

export enum PipelineLogStatus {
  Started = 'started',
  Completed = 'completed',
  Retrying = 'retrying',
  Failed = 'failed',
}

/**
 * Orchestration log line for one pipeline node step (streaming / audit).
 * Stored separately from `Pipeline` runtime rows for retention & querying.
 */
@Schema({
  collection: 'pipeline_logs',
  timestamps: false,
})
export class PipelineLog {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  logId: string;

  @Prop({ required: true, index: true })
  pipelineRef: string;

  @Prop({ required: true, index: true })
  workflowRef: string;

  @Prop({ required: true })
  nodeId: string;

  @Prop({
    type: String,
    enum: Object.values(WorkflowNodeType),
    required: true,
  })
  nodeType: WorkflowNodeType;

  @Prop({ required: true, min: 0 })
  order: number;

  @Prop({
    type: String,
    enum: Object.values(LogLevel),
    required: true,
  })
  level: LogLevel;

  @Prop({
    type: String,
    enum: Object.values(PipelineLogStatus),
    required: true,
  })
  status: PipelineLogStatus;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  retryCount: number;

  /** Event time (distinct from optional future document createdAt). */
  @Prop({ type: Date, required: true, default: () => new Date(), index: true })
  timestamp: Date;

  /** TTL anchor — MongoDB can expire documents after this instant (e.g. 90-day retention). */
  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const PipelineLogSchema = SchemaFactory.createForClass(PipelineLog);
export type PipelineLogDocument = HydratedDocument<PipelineLog>;

PipelineLogSchema.index({ pipelineRef: 1, timestamp: -1 });
PipelineLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
