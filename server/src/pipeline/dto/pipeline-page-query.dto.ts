import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PipelineStatus } from '../schemas/pipeline.schema';

const PIPELINE_STATUSES = Object.values(PipelineStatus);

export class PipelinePageFilterDto {
  @IsOptional()
  @IsString()
  workflowRef?: string;

  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;
}

export class PipelinePageQueryDto {
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
  @Type(() => PipelinePageFilterDto)
  filter?: PipelinePageFilterDto;

  @IsOptional()
  @IsIn(['startedAt', 'completedAt'])
  sortBy?: 'startedAt' | 'completedAt' = 'startedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PipelinePageItemDto {
  pipelineId!: string;
  workflowRef!: string;
  ruleRef!: string;
  status!: string;
  contentPrompt!: string;
  nodeCount!: number;
  nodeTypes!: string[];
  startedAt!: string;
  completedAt!: string | null;
  metadataSource?: string;
  newsTitle?: string;
}

export class PipelinePageResponseDto {
  data!: PipelinePageItemDto[];
  meta!: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
