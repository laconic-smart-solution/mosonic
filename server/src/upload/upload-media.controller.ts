import {
  BadRequestException,
  Controller,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import {
  isMirrorToLocalUploadEnabled,
  mirrorFetchedBytesToPublicUploadsUrl,
  mirrorFileServiceArtifactToPublicUploadsUrl,
  resolvePublicApiBase,
} from './file-service-local-mirror.util';

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
export class UploadMediaController {
  constructor(private readonly config: ConfigService) {}

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

    const publicBase = resolvePublicApiBase(this.config);
    const fileServiceBase = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    const mirrorEnabled = isMirrorToLocalUploadEnabled(this.config);

    if (mirrorEnabled && !publicBase) {
      throw new ServiceUnavailableException(
        'UPLOAD_MEDIA_MIRROR_TO_LOCAL requires APP_URL or PUBLIC_URL (public base URL for /uploads links)',
      );
    }

    if (!fileServiceBase) {
      if (!publicBase) {
        throw new ServiceUnavailableException(
          'Set FILE_SERVICE_URL for remote uploads, or set APP_URL / PUBLIC_URL to save files locally under ./uploads',
        );
      }
      const url = await mirrorFetchedBytesToPublicUploadsUrl(
        new Uint8Array(file.buffer),
        file.originalname,
        file.mimetype,
        publicBase,
      );
      return { url };
    }

    const base = fileServiceBase;
    const endpoint = `${base.replace(/\/+$/, '')}/upload`;
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype,
    });
    const form = new FormData();
    form.append('file', blob, file.originalname);

    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (response.status !== 201) {
      const body = await response.text().catch(() => '');
      throw new BadRequestException(
        `File service upload failed (${response.status}): ${body || response.statusText}`,
      );
    }
    const payload = (await response.json()) as {
      success?: boolean;
      data?: {
        fileUrl?: string;
        relativePath?: string;
      };
    };
    const data = payload?.data;
    if (!payload?.success || !data) {
      throw new BadRequestException(
        'File service returned an invalid response',
      );
    }
    const fileUrl = data.fileUrl?.trim() || '';
    const relativePath = data.relativePath?.trim() || '';
    const url = fileUrl || relativePath;
    if (!url.trim()) {
      throw new BadRequestException('File service did not return a file URL');
    }

    if (!mirrorEnabled) {
      return { url };
    }

    const mirrored = await mirrorFileServiceArtifactToPublicUploadsUrl(
      this.config,
      base,
      { fileUrl, relativePath },
      file.originalname,
      file.mimetype,
    );
    if (!mirrored) {
      throw new ServiceUnavailableException(
        'APP_URL or PUBLIC_URL required when UPLOAD_MEDIA_MIRROR_TO_LOCAL is true',
      );
    }
    return { url: mirrored };
  }
}
