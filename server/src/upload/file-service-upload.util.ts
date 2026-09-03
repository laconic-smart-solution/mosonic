import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { buildFileStorageFolderPath } from '../common/utils/file-storage-path.util';

const logger = new Logger('FileServiceUpload');

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi']);

const MIME_BY_VIDEO_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

export type FileServiceUploadResult = {
  fileUrl: string;
  relativePath: string;
  originalFileName?: string;
  storedFileName?: string;
};

export type NormalizedMediaUpload = {
  fileName: string;
  mimeType: string;
  mediaKind: 'video' | 'image' | 'other';
  /** Optional subfolder for file-service storage. */
  folderPath?: string;
};

function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** File-service rejects names with no extension */
function ensureFileNameHasExtension(
  fileName: string,
  mimeType: string,
): string {
  const t = (fileName || 'upload').trim().replace(/[/\\]/g, '_') || 'upload';
  if (/\.[a-zA-Z0-9]{1,16}$/.test(t)) return t;
  const mime = (mimeType || '').trim().toLowerCase();
  if (mime.startsWith('video/')) {
    if (mime.includes('webm')) return `${t}.webm`;
    if (mime.includes('quicktime')) return `${t}.mov`;
    return `${t}.mp4`;
  }
  if (mime.startsWith('image/')) {
    if (mime.includes('jpeg') || mime.includes('jpg')) return `${t}.jpg`;
    if (mime.includes('png')) return `${t}.png`;
    if (mime.includes('webp')) return `${t}.webp`;
    if (mime.includes('gif')) return `${t}.gif`;
    return `${t}.png`;
  }
  if (mime.includes('pdf')) return `${t}.pdf`;
  return `${t}.bin`;
}

function withExtension(baseName: string, ext: string): string {
  const suffix = `.${ext}`;
  if (baseName.toLowerCase().endsWith(suffix)) return baseName;
  const dot = baseName.lastIndexOf('.');
  if (dot > 0 && dot < baseName.length - 1) {
    return `${baseName.slice(0, dot)}${suffix}`;
  }
  return `${baseName}${suffix}`;
}

/** Detect user/API video uploads so MIME and extension match file-service expectations. */
export function isVideoUpload(originalName: string, mimeType: string): boolean {
  const mt = (mimeType || '').trim().toLowerCase();
  if (mt.startsWith('video/')) return true;
  const ext = extFromName(originalName);
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Ensures video files use a supported extension and `video/*` MIME before POSTing to file-service.
 */
export function normalizeMediaUploadMeta(
  originalName: string,
  mimeType: string,
): NormalizedMediaUpload {
  const base =
    (originalName || 'upload').trim().replace(/[/\\]/g, '_') || 'upload';
  const mime = (mimeType || '').trim().toLowerCase();
  const ext = extFromName(base);

  if (isVideoUpload(base, mime)) {
    const resolvedExt = ext && VIDEO_EXTENSIONS.has(ext) ? ext : 'mp4';
    const fileName = withExtension(
      ext && VIDEO_EXTENSIONS.has(ext)
        ? base
        : base.replace(/\.[^.]+$/, '') || base,
      resolvedExt,
    );
    const mimeTypeResolved =
      mime.startsWith('video/') && mime !== 'application/octet-stream'
        ? mime
        : (MIME_BY_VIDEO_EXT[resolvedExt] ?? 'video/mp4');
    return {
      fileName,
      mimeType: mimeTypeResolved,
      mediaKind: 'video',
      folderPath: buildFileStorageFolderPath('videos'),
    };
  }

  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)
  ) {
    return {
      fileName: base,
      mimeType: mime || 'image/png',
      mediaKind: 'image',
      folderPath: buildFileStorageFolderPath('images'),
    };
  }

  return {
    fileName: base,
    mimeType: mime || 'application/octet-stream',
    mediaKind: 'other',
  };
}

async function postToFileService(
  endpoint: string,
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
  folderPath?: string,
): Promise<FileServiceUploadResult> {
  const form = new FormData();
  const safeName = ensureFileNameHasExtension(fileName, mimeType);
  const blob = new Blob([Uint8Array.from(buffer)], { type: mimeType });
  form.append('file', blob, safeName);
  const fp = folderPath?.trim();
  if (fp) {
    form.append('folderPath', fp);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: form });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      `External file service unreachable: ${msg} | endpoint=${endpoint} | file=${safeName}`,
    );
    throw err;
  }

  if (response.status !== 201) {
    const bodyText = await response.text().catch(() => '');
    logger.warn(
      `External file service upload failed: status=${response.status} ${response.statusText} | endpoint=${endpoint} | file=${safeName} | body=${bodyText.slice(0, 500)}${bodyText.length > 500 ? '…' : ''}`,
    );
    throw new BadRequestException(
      `File service upload failed (${response.status}): ${bodyText || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: {
      fileUrl?: string;
      relativePath?: string;
      originalFileName?: string;
      storedFileName?: string;
    };
  };
  const data = payload?.data;
  if (!payload?.success || !data) {
    logger.warn(
      `External file service returned invalid envelope: endpoint=${endpoint} | file=${safeName} | payload=${JSON.stringify(payload).slice(0, 500)}`,
    );
    throw new BadRequestException('File service returned an invalid response');
  }

  const fileUrl = (data.fileUrl ?? '').trim();
  const relativePath = (data.relativePath ?? '').trim();
  const url = fileUrl || relativePath;
  if (!url) {
    logger.warn(
      `External file service missing file URL in response: endpoint=${endpoint} | file=${safeName}`,
    );
    throw new BadRequestException('File service did not return a file URL');
  }

  return {
    fileUrl: url,
    relativePath: relativePath || url,
    originalFileName: data.originalFileName,
    storedFileName: data.storedFileName,
  };
}

export function isFileServiceUnsupportedTypeError(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('(400)') &&
    (msg.includes('unsupported file type') || msg.includes('unsupported'))
  );
}

function stemFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return base.replace(/[^\w.-]+/g, '_') || 'video';
}

/** Alternate filenames/MIMEs when file-service allowlists video but not `.mp4`. */
export function buildVideoUploadAttempts(
  normalized: NormalizedMediaUpload,
  folderPath?: string,
): Array<{ fileName: string; mimeType: string; folderPath?: string }> {
  const stem = stemFromFileName(normalized.fileName);
  const fp = folderPath?.trim() || normalized.folderPath;
  const attempts: Array<{
    fileName: string;
    mimeType: string;
    folderPath?: string;
  }> = [
    {
      fileName: normalized.fileName,
      mimeType: normalized.mimeType,
      folderPath: fp,
    },
    { fileName: `${stem}.mov`, mimeType: 'video/quicktime', folderPath: fp },
    { fileName: `${stem}.webm`, mimeType: 'video/webm', folderPath: fp },
    { fileName: normalized.fileName, mimeType: normalized.mimeType },
    { fileName: `${stem}.mov`, mimeType: 'video/quicktime' },
    {
      fileName: `${stem}.bin`,
      mimeType: 'application/octet-stream',
      folderPath: fp,
    },
    {
      fileName: `${randomUUID()}.mov`,
      mimeType: 'video/quicktime',
      folderPath: fp,
    },
  ];
  const seen = new Set<string>();
  return attempts.filter((a) => {
    const key = `${a.fileName}|${a.mimeType}|${a.folderPath ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Upload bytes to file-service `/upload` with normalized video metadata and extension fallbacks.
 */
export async function uploadBufferToFileService(params: {
  fileServiceBase: string;
  buffer: Uint8Array;
  originalName: string;
  mimeType: string;
  folderPath?: string;
}): Promise<FileServiceUploadResult> {
  const base = params.fileServiceBase.replace(/\/+$/, '');
  const endpoint = `${base}/upload`;
  const normalized = normalizeMediaUploadMeta(
    params.originalName,
    params.mimeType,
  );
  const folderPath = params.folderPath?.trim() || normalized.folderPath;

  if (normalized.mediaKind !== 'video') {
    return postToFileService(
      endpoint,
      params.buffer,
      normalized.fileName,
      normalized.mimeType,
      folderPath,
    );
  }

  let lastError: unknown;
  for (const attempt of buildVideoUploadAttempts(normalized, folderPath)) {
    try {
      return await postToFileService(
        endpoint,
        params.buffer,
        attempt.fileName,
        attempt.mimeType,
        attempt.folderPath,
      );
    } catch (error) {
      lastError = error;
      if (!isFileServiceUnsupportedTypeError(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}
