import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Merged into content `outputs` when persisting Generate More results. */
export class NewOutputsBodyDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  translatedText?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  video?: string;
}

export class UserEditsBodyDto {
  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  translatedText?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  video?: string;
}

export class SaveContentDto {
  @ValidateNested()
  @Type(() => UserEditsBodyDto)
  userEdits!: UserEditsBodyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewOutputsBodyDto)
  newOutputs?: NewOutputsBodyDto;

  /** Per-node user overrides merged into `nodeUserEdits` on save. */
  @IsOptional()
  @IsObject()
  nodeUserEdits?: Record<string, Record<string, unknown>>;

  /** Per-node AI output layers. Used when copying a finished re-run onto the draft. */
  @IsOptional()
  @IsObject()
  nodeOutputs?: Record<string, Record<string, unknown>>;

  /** Per-channel adapt/image layers shown on content channel tabs. */
  @IsOptional()
  @IsObject()
  laneOutputs?: Record<string, Record<string, unknown>>;
}
