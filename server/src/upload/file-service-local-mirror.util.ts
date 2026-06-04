import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function isMirrorToLocalUploadEnabled(config: ConfigService): boolean {
  const raw = config
    .get<string>('UPLOAD_MEDIA_MIRROR_TO_LOCAL')
    ?.trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Prefer `APP_URL`; fall back to `PUBLIC_URL` (e.g. ngrok). */
export function resolvePublicApiBase(config: ConfigService): string {
  return (
    config.get<string>('APP_URL')?.trim() ||
    config.get<string>('PUBLIC_URL')?.trim() ||
    ''
  );
}

export function pickFileServiceMirrorSourceUrl(
  input: { fileUrl: string; relativePath: string },
  fileServiceBase: string,
): string {
  if (input.fileUrl && /^https?:\/\//i.test(input.fileUrl)) {
    return input.fileUrl;
  }
  if (input.relativePath) {
    const base = fileServiceBase.replace(/\/+$/, '');
    const u = new URL(`${base}/file`);
    u.searchParams.set('relativePath', input.relativePath);
    return u.toString();
  }
  const fallback = (input.fileUrl || input.relativePath || '').trim();
  return new URL(fallback, fileServiceBase).toString();
}

export function pickLocalUploadExtension(
  originalName: string,
  mimetype: string,
): string {
  const lower = originalName.toLowerCase();
  const match = lower.match(/\.([a-z0-9]{1,6})$/i);
  const extFromName = match?.[0];
  if (extFromName && extFromName.length <= 7) return extFromName;

  const mt = (mimetype || '').toLowerCase();
  if (mt.includes('png')) return '.png';
  if (mt.includes('jpeg') || mt.includes('jpg')) return '.jpg';
  if (mt.includes('webp')) return '.webp';
  if (mt.includes('gif')) return '.gif';
  if (mt.includes('mp4')) return '.mp4';
  if (mt.includes('quicktime')) return '.mov';
  return '';
}

/** Writes bytes under `./uploads` and returns `{publicBase}/uploads/{name}`. */
export async function mirrorFetchedBytesToPublicUploadsUrl(
  bytes: Uint8Array,
  originalFileName: string,
  mimeType: string,
  publicBase: string,
): Promise<string> {
  const ext = pickLocalUploadExtension(originalFileName, mimeType);
  const name = `${randomUUID()}${ext}`;
  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, name), bytes);
  const root = publicBase.replace(/\/+$/, '');
  return `${root}/uploads/${name}`;
}

/**
 * After a successful file-service upload, optionally copy into `./uploads` and
 * return a public URL (ngrok). Returns `null` if mirroring is off or public base unset.
 */
export async function mirrorFileServiceArtifactToPublicUploadsUrl(
  config: ConfigService,
  fileServiceBase: string,
  data: { fileUrl: string; relativePath: string },
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  if (!isMirrorToLocalUploadEnabled(config)) return null;
  const publicBase = resolvePublicApiBase(config).replace(/\/+$/, '');
  if (!publicBase) return null;

  const sourceUrl = pickFileServiceMirrorSourceUrl(data, fileServiceBase);
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(
      `File mirror fetch failed (${res.status}): ${res.statusText}`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) {
    throw new Error('File mirror fetch returned empty body');
  }
  return await mirrorFetchedBytesToPublicUploadsUrl(
    bytes,
    fileName,
    mimeType,
    publicBase,
  );
}
