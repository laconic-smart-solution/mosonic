import { encode } from '@toon-format/toon';

/**
 * Encodes data as TOON for LLM prompt input — cheaper in tokens than JSON,
 * especially for arrays of uniform objects. Falls back to pretty JSON, then
 * to a plain string, so building a prompt can never fail over this.
 */
export function toPromptToon(data: unknown): string {
  try {
    return encode(data);
  } catch {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
}
