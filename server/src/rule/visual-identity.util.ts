/**
 * Brand visual identity helpers.
 * Colors are only kept when they look like real #hex evidence — never invent.
 */
export type VisualIdentity = {
  primary?: string;
  secondary?: string;
  accent?: string;
  neutrals?: string[];
  fonts?: string[];
  logoAssetId?: string;
  designKeywords?: string[];
  /** Longer design direction (layout mood, photography vs illustration, typography feel). */
  designDirection?: string;
  /** True when no evidenced theme colors were found. */
  colorsUnknown?: boolean;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Expand #RGB → #RRGGBB; drop alpha if #RRGGBBAA. Lowercase. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!HEX_RE.test(s)) return null;
  let h = s.slice(1).toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return null;
  return `#${h}`;
}

export function isHexColor(raw: unknown): boolean {
  return normalizeHex(raw) !== null;
}

function uniqHex(list: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const h = normalizeHex(x);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

function strList(raw: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
  return items.length ? items : undefined;
}

/**
 * Sanitize a raw visualIdentity blob (LLM JSON / patch DTO).
 * Drops invalid hex; sets colorsUnknown when no theme colors remain.
 */
export function normalizeVisualIdentity(raw: unknown): VisualIdentity | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const primary = normalizeHex(o.primary) ?? undefined;
  const secondary = normalizeHex(o.secondary) ?? undefined;
  const accent = normalizeHex(o.accent) ?? undefined;
  const neutrals = uniqHex(Array.isArray(o.neutrals) ? o.neutrals : []);
  const fonts = strList(o.fonts, 6);
  const designKeywords = strList(o.designKeywords, 12);
  const logoAssetId =
    typeof o.logoAssetId === 'string' && o.logoAssetId.trim()
      ? o.logoAssetId.trim()
      : undefined;
  const designDirection =
    typeof o.designDirection === 'string' && o.designDirection.trim()
      ? o.designDirection.trim().slice(0, 1200)
      : undefined;
  const hasColor = !!(primary || secondary || accent || neutrals.length);
  const colorsUnknown =
    o.colorsUnknown === true || (!hasColor && (designDirection || designKeywords || fonts));

  const vi: VisualIdentity = {
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    ...(accent ? { accent } : {}),
    ...(neutrals.length ? { neutrals } : {}),
    ...(fonts ? { fonts } : {}),
    ...(logoAssetId ? { logoAssetId } : {}),
    ...(designKeywords ? { designKeywords } : {}),
    ...(designDirection ? { designDirection } : {}),
    ...(colorsUnknown || !hasColor ? { colorsUnknown: true } : {}),
  };
  // Drop colorsUnknown if we actually have colors.
  if (hasColor) delete vi.colorsUnknown;
  if (
    !vi.primary &&
    !vi.secondary &&
    !vi.accent &&
    !vi.neutrals &&
    !vi.fonts &&
    !vi.logoAssetId &&
    !vi.designKeywords &&
    !vi.designDirection
  ) {
    return undefined;
  }
  return vi;
}

/** Compact lines for prompts / live context. */
export function formatVisualIdentityLines(vi: VisualIdentity | null | undefined): string[] {
  if (!vi) return [];
  const lines: string[] = [];
  const colors = [
    vi.primary ? `primary ${vi.primary}` : '',
    vi.secondary ? `secondary ${vi.secondary}` : '',
    vi.accent ? `accent ${vi.accent}` : '',
    vi.neutrals?.length ? `neutrals ${vi.neutrals.join(', ')}` : '',
  ].filter(Boolean);
  if (colors.length) lines.push(`Theme colors: ${colors.join('; ')}`);
  else if (vi.colorsUnknown) lines.push('Theme colors: unknown (no evidenced hex)');
  if (vi.fonts?.length) lines.push(`Fonts: ${vi.fonts.join(', ')}`);
  if (vi.designKeywords?.length) lines.push(`Design keywords: ${vi.designKeywords.join(', ')}`);
  if (vi.designDirection) lines.push(`Design direction: ${vi.designDirection}`);
  if (vi.logoAssetId) lines.push(`Logo asset: ${vi.logoAssetId}`);
  return lines;
}

/** Markdown body suitable for a brand_guide / guideline snippet. */
export function visualIdentityGuideMarkdown(vi: VisualIdentity): string {
  const lines = ['# Brand visual identity', ''];
  for (const l of formatVisualIdentityLines(vi)) lines.push(`- ${l}`);
  return lines.join('\n');
}
