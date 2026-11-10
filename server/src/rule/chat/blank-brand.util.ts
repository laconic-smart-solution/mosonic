/**
 * "Empty" brand = Welcome's "Start a new brand" shell (or anything equally bare):
 * there is nothing to introduce yet, so chat must collect intake before it
 * offers a post, an intro, or generation.
 */

type RuleLike = {
  name?: unknown;
  brand?: unknown;
  status?: unknown;
  intake?: unknown;
};

const UNTITLED = /^\s*(untitled(\s+brand)?|new brand)?\s*$/i;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Explicit readiness lifecycle for a brand profile.
 */
export type BrandReadiness =
  | 'EMPTY'           // Blank shell (Untitled, no brand info)
  | 'INTAKE_PENDING'  // Waiting for brand information or website URL
  | 'EXTRACTING'      // Brand extraction is actively running
  | 'READY'           // Brand is fully populated and ready for workflow/generation
  | 'FAILED';         // Extraction failed

export type BrandReadinessInfo = {
  readiness: BrandReadiness;
  reason?: string;
  brandName?: string;
  brandDescription?: string;
  industry?: string;
};

/**
 * Evaluates the brand readiness state from the rule record.
 * Handles existing populated brands (evaluated as READY) as well as newly created shells.
 */
export function getBrandReadiness(
  rule: RuleLike | null | undefined,
  assets?: ReadonlyArray<{ type?: unknown }> | null,
): BrandReadinessInfo {
  if (!rule) {
    return { readiness: 'EMPTY', reason: 'No brand profile exists.' };
  }

  const intake = (rule.intake && typeof rule.intake === 'object' ? rule.intake : {}) as Record<string, unknown>;
  const statusStr = String(rule.status ?? '').toLowerCase();

  if (statusStr === 'failed' || intake.readiness === 'FAILED') {
    return {
      readiness: 'FAILED',
      reason: str(intake.failureReason) || 'Brand extraction failed. Please retry or provide brand details manually.',
    };
  }

  if (statusStr === 'processing' || intake.readiness === 'EXTRACTING') {
    return {
      readiness: 'EXTRACTING',
      reason: 'Brand extraction is currently running in the background.',
    };
  }

  if (intake.readiness === 'INTAKE_PENDING') {
    return {
      readiness: 'INTAKE_PENDING',
      reason: 'Awaiting brand URL or business details from user.',
    };
  }

  if (isBlankBrand(rule)) {
    return {
      readiness: 'EMPTY',
      reason: 'This brand was just created and has no name, description, or website yet.',
    };
  }

  const brand = (rule.brand && typeof rule.brand === 'object' ? rule.brand : {}) as Record<string, unknown>;
  return {
    readiness: 'READY',
    brandName: str(rule.name) || str(brand.brandName) || 'My Brand',
    brandDescription: str(brand.brandDescription),
    industry: str(brand.industry),
  };
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

/** Logo / site images already pulled in. */
export function brandHasIntakeSeed(
  assets: ReadonlyArray<{ type?: unknown }> | null | undefined,
): boolean {
  if (!assets?.length) return false;
  return assets.some((a) => {
    const t = String(a.type ?? '');
    return t === 'logo' || t === 'reference_image';
  });
}

/**
 * Gate for chat: true when the brand is not READY yet.
 * Generation and workflow setup tools remain blocked until readiness === 'READY'.
 */
export function shouldGateBlankBrand(
  rule: RuleLike | null | undefined,
  assets?: ReadonlyArray<{ type?: unknown }> | null,
): boolean {
  const { readiness } = getBrandReadiness(rule, assets);
  return readiness !== 'READY';
}

/** Tools that make or ship content: unbound while the brand is blank. */
export const BLANK_BRAND_BLOCKED_TOOLS: ReadonlySet<string> = new Set([
  'start_generation',
  'preview_generation',
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
  '## Brand is not ready (server check)',
  'This brand profile is not ready yet: it needs brand identity and factual context before generation can start.',
  'Your first priority is brand intake: ask for the brand name, a website URL, and/or a short description.',
  'When the user provides a website URL:',
  '1. Call ingest_website_content with the URL to extract brand identity, description, value proposition, and facts.',
  '2. Call fetch_website_assets to retrieve brand logos and reference imagery (image fetching operates independently and does not block brand extraction).',
  '3. For specific listing/room promotion posts: verify if room/listing facts (title, rate) were found in the site data. If not, ask the user ONE targeted question for the specific room/rate before generation.',
  '4. Once brand readiness is READY and workflow is prepared, call start_generation to present the preview card.',
  'When the user attaches files or images (marketing overview, brand guidelines, product documents, logo) OR mentions attached assets:',
  '- READ the attached files and images under "## Brand assets & knowledge files". These contain the core knowledge to build the brand.',
  '- If the brand is new, untitled, or missing details: immediately call update_rule to extract and populate brand name (both name and brand.brandName), industry, description, target audience, and visualIdentity (from logo description).',
  '- NEVER leave the brand as "Untitled brand" or workflow as "Untitled · Workflow" when attached files or images provide the brand/product identity and name.',
  '- Call apply_default_workflow in the same turn so the marketing workflow is configured right away.',
  '- Once the brand profile is updated from the attached files, acknowledge the brand and proceed with their request.',
  'When the user has NO website or provides details directly in chat (e.g. brand name, industry, topic) or waives details ("u decide", "build by urself"):',
  '- Immediately call update_rule to save the brand name and industry/description (never leave it blank or fail with excuses).',
  '- If channels were not mentioned, include default channels (facebook, instagram) on update_rule.',
  '- Immediately call apply_default_workflow in the same turn so the marketing workflow is set up.',
  '- Respond warmly with thoughtful marketing context explaining that the brand profile and workflow are set up, and propose 2-3 engaging angles or topics for their first post.',
  '- NEVER say "The workflow itself is still unconfigured, so content generation can\'t start yet" - configure it with apply_default_workflow in that very turn!',
  'Do NOT offer to start generation or claim the draft is ready until brand readiness is READY.',
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

/**
 * Best-effort display name from a brand URL host (www.beautyphoo.com → Beautyphoo).
 * Used to seed an Untitled shell after fetch_website_assets so the intake gate lifts.
 */
export function brandNameFromWebsiteUrl(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, '');
    const base = (host.split('.')[0] || host).trim();
    if (!base) return 'My brand';
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return 'My brand';
  }
}