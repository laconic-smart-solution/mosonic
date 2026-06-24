import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ContentPromptStrategy } from '../schemas/campaign-schedule.schema';

export class UpsertCampaignScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  workflowTemplateId?: string | null;

  @IsOptional()
  @IsString()
  workflowRef?: string | null;

  @IsOptional()
  @IsEnum(ContentPromptStrategy)
  contentPromptStrategy?: (typeof ContentPromptStrategy)[keyof typeof ContentPromptStrategy];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentPrompts?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
