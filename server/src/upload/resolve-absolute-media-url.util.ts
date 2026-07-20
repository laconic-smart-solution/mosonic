import type { ConfigService } from '@nestjs/config';

const FILE_PROXY_PATH = '/api/file/v1/file';

export type ResolveAbsoluteMediaUrlContext = {
  fileServiceUrl?: string;
  publicBaseUrl?: string;
};

function normalizeHttpBase(raw: string): string {
  const s = raw.trim();
  return s.startsWith('http') ? s : `http://${s}`;
}

function extractRelativePathFromFileProxy(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const candidates = [raw];
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    candidates.push(`http://local${path}`);
  }

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!parsed.pathname.endsWith(FILE_PROXY_PATH)) continue;
      const relativePath = parsed.searchParams.get('relativePath')?.trim();
      if (relativePath) return relativePath;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Ensures media URLs are absolute and fetchable. Repairs values like `4001/api/file/...`
 * where the origin was stripped but FILE_SERVICE_URL / APP_URL are configured.
 */
export function resolveAbsoluteMediaUrl(
  raw: string,
  ctx: ResolveAbsoluteMediaUrlContext,
): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^(https?:|blob:|data:)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;

  const fileBase = ctx.fileServiceUrl?.trim() ?? '';
  const publicBase = ctx.publicBaseUrl?.trim() ?? '';

  const relativePath = extractRelativePathFromFileProxy(s);
  if (relativePath && fileBase) {
    const base = normalizeHttpBase(fileBase).replace(/\/+$/, '');
    return `${base}/file?relativePath=${encodeURIComponent(relativePath)}`;
  }

  const portPathMatch = /^(\d{2,5})(\/api\/.+)$/i.exec(s);
  if (portPathMatch?.[2] && fileBase) {
    try {
      const u = new URL(normalizeHttpBase(fileBase));
      return `${u.origin}${portPathMatch[2]}`;
    } catch {
      /* fall through */
    }
  }

  if (s.startsWith('/') && publicBase) {
    return `${publicBase.replace(/\/+$/, '')}${s}`;
  }

  if (
    fileBase &&
    !s.startsWith('/') &&
    !s.includes('://') &&
    !/^(\d{2,5})\//.test(s)
  ) {
    const base = normalizeHttpBase(fileBase).replace(/\/+$/, '');
    return `${base}/file?relativePath=${encodeURIComponent(s)}`;
  }

  if (fileBase) {
    try {
      return new URL(s, normalizeHttpBase(fileBase)).href;
    } catch {
      try {
        const base = normalizeHttpBase(fileBase);
        return new URL(s, new URL(base).origin).href;
      } catch {
        return s;
      }
    }
  }

  return s;
}

export function resolveAbsoluteMediaUrlFromConfig(
  raw: string,
  config: ConfigService,
): string {
  return resolveAbsoluteMediaUrl(raw, {
    fileServiceUrl: config.get<string>('FILE_SERVICE_URL') ?? undefined,
    publicBaseUrl:
      config.get<string>('APP_URL') ??
      config.get<string>('PUBLIC_URL') ??
      undefined,
  });
}
