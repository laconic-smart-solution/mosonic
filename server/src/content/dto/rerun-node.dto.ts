import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
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

  /** Follow-up instruction for this specific re-run (e.g. "make the background darker"). Overrides the pipeline's original content prompt for this run only. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RerunPreviousOutputsDto)
  previousOutputs?: RerunPreviousOutputsDto;
}
