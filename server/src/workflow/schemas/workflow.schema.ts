import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';

export enum WorkflowStatus {
  Generating = 'generating',
  Ready = 'ready',
  Failed = 'failed',
  Archived = 'archived',
}

@Schema({ _id: false })
export class WorkflowVersionEntry {
  @Prop({ required: true, min: 1 })
  versionNumber: number;

  @Prop({ type: [String], default: [] })
  nodes: string[];

  @Prop({ type: Date, required: true })
  createdAt: Date;
}
export const WorkflowVersionEntrySchema =
  SchemaFactory.createForClass(WorkflowVersionEntry);

@Schema({
  collection: 'workflows',
  timestamps: true,
})
export class Workflow {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: () => randomUUID(),
  })
  workflowId: string;

  /** App-local tenant id (`User.userId`); legacy rows may omit. */
  @Prop({ type: String, index: true })
  userId?: string;

  @Prop({ required: true, index: true })
  ruleRef: string;

  @Prop({ required: true })
  name: string;

  /** Ordered list of workflow node definition IDs (`WorkflowNode.nodeId`). */
  @Prop({ type: [String], default: [] })
  nodes: string[];

  /** When true, this workflow is stored as a reusable template. */
  @Prop({ type: Boolean, required: true, default: false })
  isTemplate: boolean;

  /** Set when `isTemplate` is true; human-readable template label. */
  @Prop({ type: String, default: null })
  templateName: string | null;

  /** Current schema/content version (for optimistic concurrency / display). */
  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version: number;

  /** History of node lists for rollback (snapshots). */
  @Prop({ type: [WorkflowVersionEntrySchema], default: [] })
  versions: WorkflowVersionEntry[];

  @Prop({
    type: String,
    enum: Object.values(WorkflowStatus),
    default: WorkflowStatus.Generating,
  })
  status: WorkflowStatus;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
export type WorkflowDocument = HydratedDocument<Workflow>;

WorkflowSchema.index({ ruleRef: 1, status: 1 });
WorkflowSchema.index({ isTemplate: 1, templateName: 1 });
WorkflowSchema.index({ userId: 1, updatedAt: -1 });
