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

/** Proxies uploads to file service (POST {FILE_SERVICE_URL}/upload). Returns { url }. */
@Controller('upload')
export class UploadMediaController {
  constructor(private readonly config: ConfigService) {}

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const base = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException(
        'FILE_SERVICE_URL is not configured; cannot upload media',
      );
    }
    const endpoint = `${base.replace(/\/+$/, '')}/upload`;
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
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
      throw new BadRequestException('File service returned an invalid response');
    }
    const url = data.fileUrl?.trim() || data.relativePath?.trim();
    if (!url) {
      throw new BadRequestException('File service did not return a file URL');
    }
    return { url };
  }
}
