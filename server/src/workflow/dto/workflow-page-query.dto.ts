import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export class WorkflowPageFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  q?: string;

  @IsOptional()
  @IsEnum(WorkflowNodeType)
  nodeType?: WorkflowNodeType;
}

export class WorkflowPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowPageFilterDto)
  filter?: WorkflowPageFilterDto;

  @IsOptional()
  @IsIn(['name', 'updatedAt', 'createdAt'])
  sortBy?: 'name' | 'updatedAt' | 'createdAt' = 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class WorkflowPageItemDto {
  workflowId!: string;
  ruleRef!: string;
  name!: string;
  status!: string;
  updatedAt!: string;
  nodeTypes!: string[];
}

export class WorkflowPageResponseDto {
  data!: WorkflowPageItemDto[];
  meta!: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
