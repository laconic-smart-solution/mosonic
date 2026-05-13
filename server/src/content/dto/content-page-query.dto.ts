import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
import type { ResolvedContentOutputs } from '../content-output.utils';
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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  hasImage?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  hasVideo?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  hasSummary?: boolean;
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
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

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
  /** Merged userEdits over outputs (same as content detail). */
  outputs!: ResolvedContentOutputs;
  /** Present when an upload sidecar exists for this content. */
  uploadId?: string;
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
