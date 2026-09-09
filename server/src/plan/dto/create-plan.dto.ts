import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PUBLISHABLE_CHANNELS } from '../lib/publishable-channels';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  priceThb: number;

  @IsNumber()
  @Min(0)
  priceUsd: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditsOverride?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(PUBLISHABLE_CHANNELS, { each: true })
  allowedChannels?: string[];
}
