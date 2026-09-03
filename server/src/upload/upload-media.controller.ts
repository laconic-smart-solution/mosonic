import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadMediaService } from './upload-media.service';

/**
 * POST /upload/media — stores media and returns a **public** URL (for Zernio etc.).
 *
 * - **File service (default):** `FILE_SERVICE_URL` upload, then return file-service URL;
 *   if `UPLOAD_MEDIA_MIRROR_TO_LOCAL` + `APP_URL`/`PUBLIC_URL`, copy into `./uploads` and
 *   return `{PUBLIC_BASE}/uploads/...` (ngrok-friendly).
 * - **Local-only dev:** omit `FILE_SERVICE_URL`; with `APP_URL` or `PUBLIC_URL` set, writes
 *   the buffer straight to `./uploads` and returns `{PUBLIC_BASE}/uploads/...`.
 */
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadMediaController {
  constructor(private readonly uploadMediaService: UploadMediaService) {}

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    }),
  )
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }

    return this.uploadMediaService.uploadBuffer(file);
  }
}
