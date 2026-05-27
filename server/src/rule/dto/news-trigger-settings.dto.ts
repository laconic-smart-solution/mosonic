import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  NewsTriggerCategory,
  NewsTriggerSchedule,
} from '../schemas/rule.schema';

export class NewsTriggerSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsEnum(NewsTriggerSchedule)
  schedule: NewsTriggerSchedule;

  @IsString()
  country: string;

  @IsString()
  language: string;

  @IsEnum(NewsTriggerCategory)
  category: NewsTriggerCategory;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  keywords: string[];

  @IsInt()
  @Min(50)
  @Max(100)
  minRelevanceScore: number;

  @IsInt()
  @Min(1)
  @Max(3)
  maxPostsPerDay: number;

  @IsBoolean()
  autoApprove: boolean;
}

export class UpdateNewsTriggerSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(NewsTriggerSchedule)
  schedule?: NewsTriggerSchedule;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(NewsTriggerCategory)
  category?: NewsTriggerCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  minRelevanceScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  maxPostsPerDay?: number;

  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}

export class NewsTriggerSettingsResponseDto {
  enabled!: boolean;
  schedule!: NewsTriggerSchedule;
  country!: string;
  language!: string;
  category!: NewsTriggerCategory;
  keywords!: string[];
  minRelevanceScore!: number;
  maxPostsPerDay!: number;
  autoApprove!: boolean;
  lastTriggeredAt!: string | null;
  totalTriggeredCount!: number;
}
