/**
 * Makes login and refresh responses easier for the SPA to parse by ensuring
 * tokens live under `data.token` when the Authorize Server returns flat fields.
 */
export function normalizeAuthorizeServerAuthBody(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') {
    return raw;
  }

  const root = raw as Record<string, unknown>;

  if (
    typeof root.access_token === 'string' ||
    typeof root.accessToken === 'string'
  ) {
    return {
      data: {
        token: {
          access_token: root.access_token ?? root.accessToken,
          refresh_token: root.refresh_token ?? root.refreshToken,
        },
      },
    };
  }

  const data = root.data;
  if (data !== null && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.token !== null && typeof d.token === 'object') {
      return raw;
    }
    if (
      typeof d.access_token === 'string' ||
      typeof d.accessToken === 'string'
    ) {
      return {
        ...root,
        data: {
          ...d,
          token: {
            access_token: d.access_token ?? d.accessToken,
            refresh_token: d.refresh_token ?? d.refreshToken,
          },
        },
      };
    }
  }

  return raw;
}
