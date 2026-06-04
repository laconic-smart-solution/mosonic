/** Defaults aligned with client-side validation (see client extract constants). */
export function ruleExtractMaxFileBytes(): number {
  const raw = process.env.RULE_EXTRACT_MAX_FILE_BYTES;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 25 * 1024 * 1024;
}

export function ruleExtractMaxFiles(): number {
  const raw = process.env.RULE_EXTRACT_MAX_FILES;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
}
