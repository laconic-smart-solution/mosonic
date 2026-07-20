/**
 * Parse Xiaohongshu `/api/sns/web/v2/user/me` (or selfinfo) JSON.
 * Returns nickname, or red_id when nickname is absent. Rejects guest payloads.
 * Deliberately ignores generic `name` fields — other endpoints reuse that key
 * for unrelated UI titles and caused random display names.
 */
export function parseXiaohongshuMeProfile(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;
  if (data.guest === true) return null;
  const nickname =
    typeof data.nickname === 'string' ? data.nickname.trim() : '';
  if (nickname) return nickname;
  const redId = typeof data.red_id === 'string' ? data.red_id.trim() : '';
  if (redId) return redId;
  return null;
}
