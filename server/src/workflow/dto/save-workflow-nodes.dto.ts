import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export class SaveWorkflowNodeDto {
  @IsString()
  @IsIn(Object.values(WorkflowNodeType))
  type!: WorkflowNodeType;

  @IsInt()
  @Min(1)
  order!: number;

  @IsBoolean()
  isLocked!: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SaveWorkflowNodesRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveWorkflowNodeDto)
  nodes!: SaveWorkflowNodeDto[];
}

export class SaveWorkflowNodesResponseDto {
  success!: boolean;
}
