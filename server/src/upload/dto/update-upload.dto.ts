import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * PATCH /upload/:uploadId — update an existing scheduled Zernio post.
 * At least one field should be sent (enforced in service).
 */
export class UpdateUploadDto {
  @IsString()
  @IsOptional()
  channel?: string | null;

  @IsString()
  @IsOptional()
  caption?: string | null;

  @IsString()
  @IsOptional()
  scheduledAt?: string | null;

  @IsString()
  @IsOptional()
  youtubeTitle?: string | null;

  @IsString()
  @IsOptional()
  mediaUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[] | null;
}
