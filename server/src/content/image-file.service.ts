import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolvePublicApiBase } from '../upload/file-service-local-mirror.util';

export type ImageFileUploadResult = {
  originalFileName: string;
  storedFileName: string;
  relativePath: string;
  fileUrl: string;
  imageProxyUrl?: string;
};

@Injectable()
export class ImageFileService {
  constructor(private readonly config: ConfigService) {}

  private requireFileServiceBase(): string {
    const base = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException(
        'FILE_SERVICE_URL is not set; cannot upload to file service',
      );
    }
    return base.replace(/\/+$/, '');
  }

  /** Public URL served by this API (GET /api/v1/image/file?image=...), when APP_URL or PUBLIC_URL is set. */
  buildImageProxyUrl(relativePath: string): string | undefined {
    const raw = resolvePublicApiBase(this.config).trim();
    if (!raw) return undefined;
    const publicBase = raw.replace(/\/+$/, '');
    const u = new URL(`${publicBase}/api/v1/image/file`);
    u.searchParams.set('image', relativePath);
    return u.toString();
  }

  /**
   * POST multipart to file-service (same as /upload/media file-service branch; optional folderPath).
   */
  async upload(
    file: Express.Multer.File,
    folderPath?: string,
  ): Promise<ImageFileUploadResult> {
    const base = this.requireFileServiceBase();
    const endpoint = `${base}/upload`;
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype,
    });
    const form = new FormData();
    form.append('file', blob, file.originalname);
    const fp = folderPath?.trim();
    if (fp) {
      form.append('folderPath', fp);
    }

    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (response.status !== 201) {
      const bodyText = await response.text().catch(() => '');
      throw new BadRequestException(
        `File service upload failed (${response.status}): ${bodyText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      success?: boolean;
      data?: {
        originalFileName?: string;
        storedFileName?: string;
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

    const originalFileName = (data.originalFileName ?? file.originalname).trim();
    const storedFileName = (data.storedFileName ?? '').trim();
    const relativePath = (data.relativePath ?? '').trim();
    const fileUrl =
      (data.fileUrl ?? '').trim() || relativePath;
    if (!relativePath) {
      throw new BadRequestException(
        'File service did not return a relativePath',
      );
    }

    const imageProxyUrl = this.buildImageProxyUrl(relativePath);

    return {
      originalFileName,
      storedFileName: storedFileName || relativePath.split('/').pop() || '',
      relativePath,
      fileUrl: fileUrl || relativePath,
      ...(imageProxyUrl ? { imageProxyUrl } : {}),
    };
  }
}
