import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AutonomyMode } from '../schemas/campaign-autonomy-policy.schema';

export class UpsertCampaignAutonomyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(AutonomyMode)
  mode?: (typeof AutonomyMode)[keyof typeof AutonomyMode];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedChannels?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPostsPerDay?: number;

  @IsOptional()
  @IsBoolean()
  blockIfPendingSuggestions?: boolean;
}
