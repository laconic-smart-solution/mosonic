/**
 * Deterministic visual-identity evidence from fetched HTML/CSS.
 * Prefer meta theme-color, CSS variables, and repeated hex — never invent.
 */
import * as cheerio from 'cheerio';
import {
  normalizeHex,
  type VisualIdentity,
} from './visual-identity.util';

export type HtmlVisualEvidence = {
  /** Block appended to the URL text chunk for the extraction LLM. */
  evidenceText: string;
  /** Best-effort identity from evidence only (may be empty colors). */
  visualIdentity: VisualIdentity;
};

const HEX_IN_TEXT = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_IN_TEXT =
  /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/gi;
const CSS_VAR_COLOR =
  /(--(?:color[-_]?primary|primary[-_]?color|brand[-_]?(?:color|primary)?|primary|secondary|accent|theme[-_]?color|main[-_]?color))\s*:\s*([^;!}{]+)/gi;
const FONT_FAMILY =
  /font-family\s*:\s*([^;!}{]+)/gi;

const GRAYISH = (hex: string): boolean => {
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Near-white / near-black / low chroma → treat as neutral
  if (max < 28 || min > 230) return true;
  return max - min < 18;
};

function rgbToHex(r: number, g: number, b: number): string | null {
  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return null;
  const h = [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return normalizeHex(`#${h}`);
}

function collectHexes(cssOrHtml: string, bag: Map<string, number>): void {
  HEX_IN_TEXT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_IN_TEXT.exec(cssOrHtml))) {
    const hex = normalizeHex(`#${m[1]}`);
    if (!hex) continue;
    bag.set(hex, (bag.get(hex) ?? 0) + 1);
  }
  RGB_IN_TEXT.lastIndex = 0;
  while ((m = RGB_IN_TEXT.exec(cssOrHtml))) {
    const hex = rgbToHex(+m[1], +m[2], +m[3]);
    if (!hex) continue;
    bag.set(hex, (bag.get(hex) ?? 0) + 1);
  }
}

function collectCssVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  CSS_VAR_COLOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_VAR_COLOR.exec(css))) {
    const name = m[1].toLowerCase();
    let hex = normalizeHex(m[2].trim());
    if (!hex) {
      const rgb = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(m[2]);
      if (rgb) hex = rgbToHex(+rgb[1], +rgb[2], +rgb[3]);
    }
    if (hex) out[name] = hex;
  }
  return out;
}

function collectFonts(css: string): string[] {
  const fonts: string[] = [];
  const seen = new Set<string>();
  FONT_FAMILY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FONT_FAMILY.exec(css))) {
    const first = m[1]
      .split(',')[0]
      ?.replace(/['"]/g, '')
      .trim();
    if (!first || /^(inherit|serif|sans-serif|monospace|system-ui)$/i.test(first)) continue;
    const key = first.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fonts.push(first);
    if (fonts.length >= 4) break;
  }
  return fonts;
}

function designKeywordsFromHtml($: cheerio.CheerioAPI, bodySample: string): string[] {
  const blob = `${$('body').attr('class') || ''} ${$('html').attr('class') || ''} ${bodySample}`.toLowerCase();
  const keywords: string[] = [];
  const push = (k: string) => {
    if (!keywords.includes(k)) keywords.push(k);
  };
  if (/\b(photo|photography|photoreal|real[- ]?photo|camera)\b/.test(blob)) push('photography');
  if (/\b(illustrat|drawing|hand[- ]?drawn|cartoon|vector art)\b/.test(blob)) push('illustration');
  if (/\b(minimal|clean|whitespace|simple)\b/.test(blob)) push('minimal');
  if (/\b(bold|vibrant|neon|loud)\b/.test(blob)) push('bold');
  if (/\b(luxury|premium|elegant|serif)\b/.test(blob)) push('premium');
  if (/\b(playful|fun|friendly)\b/.test(blob)) push('playful');
  if (/\b(hero|banner|full[- ]?bleed)\b/.test(blob)) push('hero-led layout');
  if (/\b(grid|card[- ]?layout|masonry)\b/.test(blob)) push('card grid');
  return keywords.slice(0, 8);
}

function pickRoles(
  themeMeta: string | null,
  vars: Record<string, string>,
  freq: Map<string, number>,
): Pick<VisualIdentity, 'primary' | 'secondary' | 'accent' | 'neutrals'> {
  const byRole: { primary?: string; secondary?: string; accent?: string } = {};
  if (themeMeta) byRole.primary = themeMeta;

  for (const [name, hex] of Object.entries(vars)) {
    if (/primary|brand|theme|main/.test(name) && !byRole.primary) byRole.primary = hex;
    else if (/secondary/.test(name) && !byRole.secondary) byRole.secondary = hex;
    else if (/accent/.test(name) && !byRole.accent) byRole.accent = hex;
  }

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const chromatics = ranked.filter((h) => !GRAYISH(h));
  const neutrals = ranked.filter((h) => GRAYISH(h)).slice(0, 4);

  if (!byRole.primary && chromatics[0]) byRole.primary = chromatics[0];
  if (!byRole.secondary && chromatics[1]) byRole.secondary = chromatics[1];
  if (!byRole.accent && chromatics[2]) byRole.accent = chromatics[2];

  // Avoid duplicates across roles
  if (byRole.secondary && byRole.secondary === byRole.primary) delete byRole.secondary;
  if (byRole.accent && (byRole.accent === byRole.primary || byRole.accent === byRole.secondary)) {
    delete byRole.accent;
  }

  return {
    ...byRole,
    ...(neutrals.length ? { neutrals } : {}),
  };
}

/**
 * Extract visual identity evidence from raw HTML (styles still present).
 */
export function extractVisualIdentityFromHtml(html: string): HtmlVisualEvidence {
  const $ = cheerio.load(html);
  const themeMeta = normalizeHex(
    $('meta[name="theme-color"]').attr('content') ||
      $('meta[name="msapplication-TileColor"]').attr('content') ||
      '',
  );

  const styleChunks: string[] = [];
  $('style').each((_, el) => {
    styleChunks.push($(el).text() || '');
  });
  $('[style]').each((_, el) => {
    styleChunks.push($(el).attr('style') || '');
  });
  // Linked stylesheet hrefs are not fetched here (no network) — note in evidence.
  const linkedSheets: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) linkedSheets.push(href);
  });

  const css = styleChunks.join('\n');
  const freq = new Map<string, number>();
  collectHexes(css, freq);
  collectHexes(html.slice(0, 200_000), freq);
  if (themeMeta) freq.set(themeMeta, (freq.get(themeMeta) ?? 0) + 5);

  const vars = collectCssVars(css);
  for (const hex of Object.values(vars)) {
    freq.set(hex, (freq.get(hex) ?? 0) + 3);
  }

  const fonts = collectFonts(css);
  const bodySample = ($('body').text() || '').slice(0, 2500);
  const keywords = designKeywordsFromHtml($, bodySample);
  const roles = pickRoles(themeMeta, vars, freq);
  const hasColor = !!(roles.primary || roles.secondary || roles.accent || roles.neutrals?.length);

  const designBits: string[] = [];
  if (keywords.length) designBits.push(`mood/keywords: ${keywords.join(', ')}`);
  if (fonts.length) designBits.push(`typography: ${fonts.join(', ')}`);
  if (/\b(photo|image|gallery|portfolio)\b/i.test(bodySample)) {
    designBits.push('page emphasizes imagery (likely photography-led)');
  }
  if (linkedSheets.length) {
    designBits.push(
      `external stylesheets present (${linkedSheets.length}) — colors above are from inline/embedded CSS + meta only`,
    );
  }

  const designDirection = designBits.length
    ? designBits.join('. ').slice(0, 600)
    : undefined;

  const visualIdentity: VisualIdentity = {
    ...roles,
    ...(fonts.length ? { fonts } : {}),
    ...(keywords.length ? { designKeywords: keywords } : {}),
    ...(designDirection ? { designDirection } : {}),
    ...(!hasColor ? { colorsUnknown: true } : {}),
  };

  const evidenceLines = [
    '=== VISUAL IDENTITY EVIDENCE (from page CSS/HTML meta; do not invent colors beyond this)',
  ];
  if (themeMeta) evidenceLines.push(`meta theme-color: ${themeMeta}`);
  for (const [name, hex] of Object.entries(vars)) {
    evidenceLines.push(`css ${name}: ${hex}`);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    evidenceLines.push(
      `frequent hex (count): ${top.map(([h, n]) => `${h}×${n}`).join(', ')}`,
    );
  }
  if (roles.primary) evidenceLines.push(`suggested primary: ${roles.primary}`);
  if (roles.secondary) evidenceLines.push(`suggested secondary: ${roles.secondary}`);
  if (roles.accent) evidenceLines.push(`suggested accent: ${roles.accent}`);
  if (roles.neutrals?.length) evidenceLines.push(`neutrals: ${roles.neutrals.join(', ')}`);
  if (fonts.length) evidenceLines.push(`fonts: ${fonts.join(', ')}`);
  if (keywords.length) evidenceLines.push(`design keywords: ${keywords.join(', ')}`);
  if (designDirection) evidenceLines.push(`design direction: ${designDirection}`);
  if (!hasColor) {
    evidenceLines.push(
      'No reliable theme hex found in meta/inline CSS. Leave brand.visualIdentity colors empty; set colorsUnknown true. Do not invent hex codes.',
    );
  }

  return {
    evidenceText: evidenceLines.join('\n'),
    visualIdentity,
  };
}

/**
 * Pull a VISUAL IDENTITY EVIDENCE block (or any hex suggestions) out of
 * extraction context text so we can overlay deterministic colors after the LLM.
 */
export function visualIdentityFromEvidenceText(text: string): VisualIdentity | undefined {
  if (!text || !/VISUAL IDENTITY EVIDENCE/i.test(text)) return undefined;
  const marker = text.search(/=== VISUAL IDENTITY EVIDENCE/i);
  let block = marker >= 0 ? text.slice(marker) : text;
  const nextSection = block.indexOf("\n=== ", 10);
  if (nextSection > 0) block = block.slice(0, nextSection);
  const grab = (re: RegExp): string | undefined => {
    const m = block.match(re);
    return m ? normalizeHex(m[1]) ?? undefined : undefined;
  };
  const primary =
    grab(/suggested primary:\s*(#[0-9a-fA-F]{3,8})/i) ||
    grab(/meta theme-color:\s*(#[0-9a-fA-F]{3,8})/i);
  const secondary = grab(/suggested secondary:\s*(#[0-9a-fA-F]{3,8})/i);
  const accent = grab(/suggested accent:\s*(#[0-9a-fA-F]{3,8})/i);
  const fontsM = block.match(/fonts:\s*([^\n]+)/i);
  const fonts = fontsM
    ? fontsM[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4)
    : undefined;
  const kwM = block.match(/design keywords:\s*([^\n]+)/i);
  const designKeywords = kwM
    ? kwM[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : undefined;
  const dirM = block.match(/design direction:\s*([^\n]+)/i);
  const designDirection = dirM?.[1]?.trim();
  const unknown = /No reliable theme hex/i.test(block);
  const vi: VisualIdentity = {
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    ...(accent ? { accent } : {}),
    ...(fonts?.length ? { fonts } : {}),
    ...(designKeywords?.length ? { designKeywords } : {}),
    ...(designDirection ? { designDirection } : {}),
    ...(unknown || !primary ? { colorsUnknown: true } : {}),
  };
  if (primary) delete vi.colorsUnknown;
  return Object.keys(vi).length ? vi : undefined;
}

/** Prefer evidenced hexes over LLM-invented ones. */
export function mergeVisualIdentityEvidence(
  llmVi: VisualIdentity | undefined,
  evidenceVi: VisualIdentity | undefined,
): VisualIdentity | undefined {
  if (!llmVi && !evidenceVi) return undefined;
  if (!evidenceVi) return llmVi;
  if (!llmVi) return evidenceVi;
  // Evidence wins for colors; LLM may enrich keywords/direction if evidence lacks them.
  const hasEvidenceColor = !!(
    evidenceVi.primary ||
    evidenceVi.secondary ||
    evidenceVi.accent
  );
  const merged: VisualIdentity = {
    ...llmVi,
    ...evidenceVi,
    fonts: evidenceVi.fonts?.length ? evidenceVi.fonts : llmVi.fonts,
    designKeywords:
      evidenceVi.designKeywords?.length
        ? evidenceVi.designKeywords
        : llmVi.designKeywords,
    designDirection: evidenceVi.designDirection || llmVi.designDirection,
  };
  if (hasEvidenceColor) {
    merged.primary = evidenceVi.primary;
    merged.secondary = evidenceVi.secondary;
    merged.accent = evidenceVi.accent;
    merged.neutrals = evidenceVi.neutrals ?? llmVi.neutrals;
    delete merged.colorsUnknown;
  } else {
    // Drop LLM-only hex — anti-hallucination.
    delete merged.primary;
    delete merged.secondary;
    delete merged.accent;
    delete merged.neutrals;
    merged.colorsUnknown = true;
  }
  return merged;
}
