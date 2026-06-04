import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class WorkflowEdgeEntry {
  @Prop({ type: String, required: true })
  from: string;

  @Prop({ type: String, required: true })
  to: string;

  @Prop({ type: String })
  sourceHandle?: string;

  @Prop({ type: String })
  targetHandle?: string;
}

export const WorkflowEdgeEntrySchema =
  SchemaFactory.createForClass(WorkflowEdgeEntry);
