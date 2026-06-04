import {
  Allow,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * PATCH /upload/:uploadId/channels/:channel — persist draft before publish.
 * At least one field should be sent (enforced in service).
 */
export class PatchUploadChannelBodyDto {
  @IsOptional()
  @IsBoolean()
  included?: boolean;

  @IsOptional()
  @Allow()
  caption?: string | null;

  @IsOptional()
  @Allow()
  mediaUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @Allow()
  youtubeTitle?: string | null;
}
