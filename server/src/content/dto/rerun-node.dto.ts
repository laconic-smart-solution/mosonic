import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class RerunPreviousOutputsDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  translatedText?: string;

  @IsOptional()
  @IsString()
  video?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class RerunNodeDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsOptional()
  @IsObject()
  updatedConfig?: Record<string, unknown>;

  /** @deprecated Use `updatedConfig` instead; ignored when `updatedConfig` is provided. */
  @IsOptional()
  @IsString()
  updatedPrompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RerunPreviousOutputsDto)
  previousOutputs?: RerunPreviousOutputsDto;
}
