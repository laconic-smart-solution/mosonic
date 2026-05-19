import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export class SaveWorkflowEdgeDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @IsOptional()
  @IsString()
  targetHandle?: string;
}

export class SaveWorkflowNodeDto {
  @IsOptional()
  @IsString()
  nodeId?: string;

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

  @IsOptional()
  @IsString()
  lane?: string;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;
}

export class SaveWorkflowNodesRequestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveWorkflowNodeDto)
  nodes!: SaveWorkflowNodeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveWorkflowEdgeDto)
  edges?: SaveWorkflowEdgeDto[];
}

export class SaveWorkflowNodesResponseDto {
  success!: boolean;
}

export class SaveWorkflowNodesByRuleRequestDto extends SaveWorkflowNodesRequestDto {}

export class SaveWorkflowNodesByRuleResponseDto {
  workflowId!: string;
  success!: boolean;
}
