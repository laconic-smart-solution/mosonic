import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Per-channel inclusion only — caption/media read from persisted row (PATCH first if editing). */
export class ChannelPublishDto {
  @IsString()
  @IsNotEmpty()
  channel!: string;

  @IsBoolean()
  included!: boolean;
}

export class PublishUploadDto {
  @IsBoolean()
  publishNow!: boolean;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelPublishDto)
  channels!: ChannelPublishDto[];
}
