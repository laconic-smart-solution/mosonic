/** Root folder segment on the external file service (unchanged across environments). */
export const FILE_STORAGE_APP_ROOT = 'neural-tex';

export type FileStorageEnvironment = 'testing' | 'production';

/**
 * Reads `CURRENT_ENVIRONMENT` from process env.
 * Only `testing` and `production` add a top-level prefix; other values keep legacy paths.
 */
export function resolveFileStorageEnvironment(): FileStorageEnvironment | null {
  const raw = (process.env.CURRENT_ENVIRONMENT ?? '').trim().toLowerCase();
  if (raw === 'testing' || raw === 'production') {
    return raw;
  }
  return null;
}

/**
 * Build a file-service `folderPath`, e.g.
 * - testing + videos + abc → `testing/neural-tex/videos/abc`
 * - production + images → `production/neural-tex/images`
 * - unset env + videos → `neural-tex/videos`
 */
export function buildFileStorageFolderPath(...segments: string[]): string {
  const env = resolveFileStorageEnvironment();
  const cleaned = segments
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  const parts = env
    ? [env, FILE_STORAGE_APP_ROOT, ...cleaned]
    : [FILE_STORAGE_APP_ROOT, ...cleaned];
  return parts.join('/');
}
