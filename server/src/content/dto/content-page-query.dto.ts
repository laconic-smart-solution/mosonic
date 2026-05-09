import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ContentStatus } from '../schemas/content.schema';

export class ContentPageFilterDto {
  @IsOptional()
  @IsString()
  workflowRef?: string;

  @IsOptional()
  @IsString()
  ruleRef?: string;

  @IsOptional()
  @IsString()
  pipelineRef?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class ContentPageQueryDto {
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
  @Type(() => ContentPageFilterDto)
  filter?: ContentPageFilterDto;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  sortBy?: 'createdAt' | 'updatedAt' = 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class ContentPageItemDto {
  contentId!: string;
  pipelineRef!: string;
  workflowRef!: string;
  ruleRef!: string;
  status!: ContentStatus;
  updatedAt!: string;
  createdAt!: string;
}

export class ContentPageResponseDto {
  data!: ContentPageItemDto[];
  meta!: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
