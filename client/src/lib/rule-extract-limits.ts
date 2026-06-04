/** Default matches server `RULE_EXTRACT_MAX_FILE_BYTES` when unset (25 MiB). */
export const RULE_EXTRACT_MAX_FILE_BYTES = 25 * 1024 * 1024

export function formatMaxFileSizeMb(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)))
}
