import { IsOptional, IsString } from 'class-validator';

/**
 * PATCH /upload/:uploadId — update an existing scheduled Zernio post.
 * At least one field should be sent (enforced in service).
 */
export class UpdateUploadDto {
  @IsString()
  @IsOptional()
  caption?: string | null;

  @IsString()
  @IsOptional()
  scheduledAt?: string | null;

  @IsString()
  @IsOptional()
  youtubeTitle?: string | null;
}
