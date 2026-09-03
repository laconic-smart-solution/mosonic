import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isMirrorToLocalUploadEnabled,
  mirrorFetchedBytesToPublicUploadsUrl,
  mirrorFileServiceArtifactToPublicUploadsUrl,
  resolvePublicApiBase,
} from './file-service-local-mirror.util';
import {
  isFileServiceUnsupportedTypeError,
  isVideoUpload,
  uploadBufferToFileService,
} from './file-service-upload.util';

export type UploadableBuffer = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

/**
 * Core "store media, return a public URL" logic shared by the generic
 * `/upload/media` HTTP endpoint and any server-side caller (e.g. admin
 * endpoints that accept a file directly rather than requiring the client
 * to pre-upload and pass back a URL string).
 */
@Injectable()
export class UploadMediaService {
  constructor(private readonly config: ConfigService) {}

  async uploadBuffer(file: UploadableBuffer): Promise<{ url: string }> {
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

    const base = fileServiceBase.replace(/\/+$/, '');
    let uploaded: Awaited<ReturnType<typeof uploadBufferToFileService>>;
    try {
      uploaded = await uploadBufferToFileService({
        fileServiceBase: base,
        buffer: new Uint8Array(file.buffer),
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
    } catch (error) {
      // File-service may still block `.mp4` by extension; store under ./uploads when public base is set.
      if (
        publicBase &&
        isVideoUpload(file.originalname, file.mimetype) &&
        isFileServiceUnsupportedTypeError(error)
      ) {
        const url = await mirrorFetchedBytesToPublicUploadsUrl(
          new Uint8Array(file.buffer),
          file.originalname,
          file.mimetype || 'video/mp4',
          publicBase,
        );
        return { url };
      }
      throw error;
    }
    const url = uploaded.fileUrl;

    if (!mirrorEnabled) {
      return { url };
    }

    const mirrored = await mirrorFileServiceArtifactToPublicUploadsUrl(
      this.config,
      base,
      {
        fileUrl: uploaded.fileUrl,
        relativePath: uploaded.relativePath,
      },
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
