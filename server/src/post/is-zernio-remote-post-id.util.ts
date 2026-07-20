/**
 * True when `zernioPostId` is a real Zernio remote id (safe to call Zernio REST).
 * RedNote stores synthetic ids (`rednote:…`) or Xiaohongshu URLs in the same field.
 */
export function isZernioRemotePostId(
  id: string | null | undefined,
): boolean {
  const s = (id ?? '').trim();
  if (!s) return false;
  if (/^rednote:/i.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return false;
  return true;
}
