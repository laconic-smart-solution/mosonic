import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export class GenerateNodeDto {
  @IsEnum(WorkflowNodeType)
  type!: WorkflowNodeType;

  @IsOptional()
  @IsString()
  userPrompt?: string;
}
