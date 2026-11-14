import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAbsoluteMediaUrlFromConfig } from '../../upload/resolve-absolute-media-url.util';

const DEFAULT_FILE_SERVICE_UPLOAD_PATH = '/upload';

export interface UploadImageBase64Params {
  base64: string;
  mimeType: string;
  fileName: string;
  folderPath?: string;
}

export interface UploadedImageEnvelope {
  fileUrl: string;
  relativePath: string;
  storedFileName: string;
  originalFileName?: string;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const maybe = error as Error & {
      status?: number;
      code?: string;
      type?: string;
    };
    return JSON.stringify({
      name: maybe.name,
      message: maybe.message,
      status: maybe.status,
      code: maybe.code,
      type: maybe.type,
    });
  }
  return String(error ?? 'unknown');
}

export async function uploadImageBase64ToService(
  config: ConfigService,
  params: UploadImageBase64Params,
  logger?: Logger,
): Promise<UploadedImageEnvelope> {
  const baseUrl = config.get<string>('FILE_SERVICE_URL')?.trim();
  if (!baseUrl) {
    throw new Error(
      'FILE_SERVICE_URL is not set; add it to .env to upload generated images',
    );
  }
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${DEFAULT_FILE_SERVICE_UPLOAD_PATH}`;
  try {
    const bytes = Buffer.from(params.base64, 'base64');
    const file = new Blob([bytes], { type: params.mimeType });
    const form = new FormData();
    form.append('file', file, params.fileName);
    if (params.folderPath?.trim()) {
      form.append('folderPath', params.folderPath.trim());
    }

    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (response.status !== 201) {
      throw new Error(
        `Image upload failed with status ${response.status}: ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      success?: boolean;
      data?: {
        fileUrl?: string;
        relativePath?: string;
        storedFileName?: string;
        originalFileName?: string;
      };
    };
    const data = payload?.data;
    if (!payload?.success || !data?.fileUrl || !data?.relativePath) {
      throw new Error('Image upload returned malformed response envelope');
    }

    return {
      fileUrl:
        resolveAbsoluteMediaUrlFromConfig(data.fileUrl, config) ||
        data.fileUrl,
      relativePath: data.relativePath,
      storedFileName: data.storedFileName ?? params.fileName,
      originalFileName: data.originalFileName,
    };
  } catch (error) {
    logger?.error(
      `Image upload failed | endpoint=${endpoint} | fileName=${params.fileName} | details=${formatError(error)}`,
    );
    throw error;
  }
}
