import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export class GenerateNodeDto {
  @IsEnum(WorkflowNodeType)
  type!: WorkflowNodeType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /** @deprecated Use `config` instead; ignored when `config` is provided. */
  @IsOptional()
  @IsString()
  userPrompt?: string;
}
