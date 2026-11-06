/**
 * "Empty" brand = Welcome's "Start a new brand" shell (or anything equally bare):
 * there is nothing to introduce yet, so chat must collect intake before it
 * offers a post, an intro, or generation.
 */

type RuleLike = { name?: unknown; brand?: unknown };

const UNTITLED = /^\s*(untitled(\s+brand)?|new brand)?\s*$/i;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * True when the brand has no real identity yet: name and brandName are
 * blank/"Untitled", and there is no description, voice, industry, or visual identity.
 */
export function isBlankBrand(rule: RuleLike | null | undefined): boolean {
  if (!rule) return false;
  const brand = (rule.brand && typeof rule.brand === 'object' ? rule.brand : {}) as Record<string, unknown>;
  if (!UNTITLED.test(str(rule.name))) return false;
  if (!UNTITLED.test(str(brand.brandName))) return false;
  if (str(brand.brandDescription) || str(brand.brandVoice) || str(brand.industry)) return false;
  const vi = brand.visualIdentity;
  if (vi && typeof vi === 'object' && Object.keys(vi as object).length > 0) return false;
  return true;
}

/** Tools that make or ship content: unbound while the brand is blank. */
export const BLANK_BRAND_BLOCKED_TOOLS: ReadonlySet<string> = new Set([
  'start_generation',
  'preview_generation',
  'apply_default_workflow',
  'generate_workflow',
  'generate_more_image',
  'generate_more_translation',
  'generate_more_summary',
  'generate_more_adapt',
  'generate_presenter_video',
  'generate_cinematic_video',
  'save_content',
  'publish_now',
  'schedule_publish',
  'suggest_rule_improvement',
  'apply_rule_suggestion',
]);

export const BLANK_BRAND_PROMPT = [
  '## Brand is empty (server check)',
  'This brand was just created and has no name, description, or website yet - there is nothing to introduce.',
  'Your first job is intake: ask for the brand name plus a website URL and/or a one or two line description.',
  'Save answers with update_rule (name, brand.brandName, brand.brandDescription); for a URL use fetch_website_assets.',
  'Do NOT offer to make a post, introduce the brand, or start generation until the brand has a name and a description or website. Generation tools are unavailable until then.',
].join('\n');

const POST_OPTION =
  /(make[_\s-]?(a[_\s-]?)?post|first[_\s-]?post|introduc|\bintro\b|start[_\s-]?(post|generation)|generat|create[_\s-]?(a[_\s-]?)?post)/i;

/**
 * ask_user guard for a blank brand: block cards that confirm start_generation
 * or offer posting/intro choices. Returns the tool error text, or null.
 */
export function blankBrandAskBlock(args: {
  question?: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  confirmFor?: string;
}): string | null {
  const offersPost =
    args.confirmFor === 'start_generation' ||
    args.options.some((o) => POST_OPTION.test(o.id) || POST_OPTION.test(o.label));
  if (!offersPost) return null;
  return 'brand_empty: this brand has no name, description, or website yet, so there is nothing to post about. Do not offer posts, intros, or generation. Ask for the brand name and a website URL or a short description first (ask_user options like "Paste my website" (inputType url) / "Describe my brand", or plain text).';
}