import { DISTRIBUTION_CHANNELS } from '../workflow/distribution-channels.util';
import { normalizeLaneId } from '../workflow/workflow-graph.util';

/**
 * What the brand's current setup can really produce, and a preflight that
 * compares a request against it BEFORE any generation runs.
 *
 * Verified in code (2026-11-03):
 * - Channels: instagram, facebook, linkedin, youtube, tiktok, rednote are real
 *   workflow lanes (DISTRIBUTION_CHANNELS). A missing lane is a setting
 *   (set_workflow_channels). Anything else (x/twitter, pinterest, threads...)
 *   is not supported.
 * - Image count: each Image step makes exactly 1 image per run
 *   (image-generation.service: count 1). More images = generate_more_image
 *   after the run. Several images per channel in one run: not supported.
 * - Reference images: the image step receives up to 4 pixel images
 *   (pixelAssetsFromPack cap): the brand logo plus reference images. Images
 *   attached in this chat are passed through start_generation.
 * - Mockups: the image model redraws a scene using the screenshot as a
 *   reference; there is no compositing step, so a pixel-exact real screenshot
 *   inside a device frame is not supported.
 */

const CHANNEL_WORDS: Record<string, RegExp> = {
  instagram: /\b(instagram|insta|ig)\b/i,
  facebook: /\b(facebook|fb)\b/i,
  linkedin: /\blinked ?in\b/i,
  youtube: /\b(youtube|yt|shorts)\b/i,
  tiktok: /\btik ?tok\b/i,
  rednote: /\b(rednote|red note|xiaohongshu|xhs)\b/i,
};
const UNSUPPORTED_WORDS: Record<string, RegExp> = {
  'X (Twitter)': /\b(twitter|tweet|x\.com)\b/i,
  Pinterest: /\bpinterest\b/i,
  Threads: /\bthreads\b/i,
  Snapchat: /\bsnapchat\b/i,
  Medium: /\bmedium\b(?! (size|length|shot))/i,
  Reddit: /\breddit\b/i,
  WhatsApp: /\bwhats ?app\b/i,
};
const NUMBER_WORDS: Record<string, number> = { one: 1, a: 1, an: 1, single: 1, two: 2, couple: 2, three: 3, four: 4, five: 5, six: 6 };

export type ParsedRequest = {
  channels: string[];
  unsupportedChannels: string[];
  imagesPerChannel: number | null;
  wantsImages: boolean;
  wantsMockup: boolean;
  wantsRealScreenshots: boolean;
  noStyle: boolean;
  mentionsStyle: string | null;
  /** ISO 639-1 codes the user asked the post in ("in Thai", "Thai and English versions"). */
  targetLanguages: string[];
};

/** "no images" / "text only" (English; other languages are left to the model). */
export const TEXT_ONLY_REQUEST = /\b(no|without) (images?|photos?|pictures?|visuals?)\b|\b(text only|just text|only text)\b/i;

/** Language names/codes a request can name (English words plus a few native names). */
export const LANGUAGE_WORDS: Record<string, RegExp> = {
  en: /\b(english)\b/i,
  th: /\b(thai)\b|\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22/i,
  zh: /\b(chinese|mandarin|simplified chinese|traditional chinese)\b|\u4e2d\u6587/i,
  ja: /\b(japanese)\b|\u65e5\u672c\u8a9e/i,
  ko: /\b(korean)\b/i,
  vi: /\b(vietnamese)\b/i,
  id: /\b(indonesian|bahasa indonesia)\b/i,
  ms: /\b(malay|bahasa melayu)\b/i,
  es: /\b(spanish)\b/i,
  fr: /\b(french)\b/i,
  de: /\b(german)\b/i,
  my: /\b(burmese|myanmar language)\b/i,
  lo: /\b(lao|laotian)\b/i,
  km: /\b(khmer|cambodian)\b/i,
};
const NAMES = Object.entries(LANGUAGE_WORDS);

/** "English" / "en" / "th-TH" -> ISO 639-1 code; null when unknown/empty. */
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const v = raw.trim().toLowerCase();
  const code = /^([a-z]{2})(?:[-_][a-z0-9]+)?$/i.exec(v);
  if (code) return code[1];
  const hit = NAMES.find(([, re]) => re.test(v));
  return hit ? hit[0] : null;
}
/** A language word only counts next to a translation cue ("Thai food" is not a language request). */
const LANGUAGE_CUE = /\btranslat\w*|\bbilingual\b|\b(in|into|to)\s+(\w+\s+(and|&|\+)\s+)?\w+\b|\b\w+\s+(version|versions|translation|caption|captions|copy)\b|\u0e41\u0e1b\u0e25/i;

/** Languages a request asks for, as ISO 639-1 codes in mention order. */
export function parseTargetLanguages(text: string): string[] {
  const t = text ?? '';
  if (!LANGUAGE_CUE.test(t)) return [];
  const hits: Array<{ code: string; at: number }> = [];
  for (const [code, re] of NAMES) {
    const m = re.exec(t);
    if (!m) continue;
    const word = m[0];
    const idx = m.index;
    const before = t.slice(Math.max(0, idx - 12), idx);
    const after = t.slice(idx + word.length, idx + word.length + 16);
    const cued =
      /translat\w*|bilingual|\u0e41\u0e1b\u0e25/i.test(t) ||
      /\b(in|into|to|and|&|\+|,)\s*$/i.test(before) ||
      /^\s*(version|versions|translation|caption|captions|copy|and|&|\+|,)/i.test(after);
    if (cued) hits.push({ code, at: idx });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.code);
}

export function parseRequest(text: string): ParsedRequest {
  const t = text ?? '';
  const channels = Object.entries(CHANNEL_WORDS).filter(([, re]) => re.test(t)).map(([id]) => id);
  const unsupportedChannels = Object.entries(UNSUPPORTED_WORDS).filter(([, re]) => re.test(t)).map(([n]) => n);
  const m = /\b(\d+|one|a|an|single|two|couple|three|four|five|six)\s+(?:of\s+)?(?:[a-z-]+\s+){0,2}(images?|photos?|pictures?|pics|mock-?ups?|visuals?|graphics?)\b/i.exec(t);
  const n = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()] ?? null) : null;
  const wantsMockup = /\bmock-?ups?\b|device frame|in a (phone|laptop|browser) frame/i.test(t);
  const wantsRealScreenshots = /screen ?shots?|\b(my|our) (real|actual|own) (photos?|images?|pictures?)|\b(real|actual) (photos?|images?) of (my|our)/i.test(t);
  const noStyle = /\b(no|without|not|skip)\s+(the\s+)?(watercolou?r|saved style|usual style|style)\b|\bnot in watercolou?r\b/i.test(t);
  const style = /\b(watercolou?r|illustrat\w*|minimal(ist)?|3d|cartoon|flat|photo-?real\w*|vintage|neon)\b/i.exec(t);
  return {
    channels,
    unsupportedChannels,
    imagesPerChannel: n,
    wantsImages: !TEXT_ONLY_REQUEST.test(t) && (!!m || wantsMockup || wantsRealScreenshots || /\b(image|photo|picture|visual|graphic)s?\b/i.test(t)),
    wantsMockup,
    wantsRealScreenshots,
    noStyle,
    mentionsStyle: noStyle ? null : style ? style[1].toLowerCase() : null,
    targetLanguages: parseTargetLanguages(t),
  };
}

type NodeLike = { type?: unknown; lane?: unknown; config?: unknown };

export type LaneCapability = { lane: string; images: number };

/** Lanes and image steps per lane. Image steps with no lane apply to every lane. */
export function workflowLanes(nodes: NodeLike[]): LaneCapability[] {
  const isImage = (n: NodeLike) => /image_generation|ImageGeneration/i.test(String(n.type ?? ''));
  const lanes = [...new Set(nodes.map((n) => (n.lane ? normalizeLaneId(String(n.lane)) : '')).filter(Boolean))];
  const shared = nodes.filter((n) => !n.lane && isImage(n)).length;
  return lanes.map((lane) => ({
    lane,
    images: shared + nodes.filter((n) => n.lane && normalizeLaneId(String(n.lane)) === lane && isImage(n)).length,
  }));
}

const label = (id: string) => DISTRIBUTION_CHANNELS.find((c) => c.id === id)?.label ?? id;
const list = (ids: string[]) => ids.map(label).join(', ');

export type CapabilityInput = {
  brandName: string;
  brandChannels: string[];
  nodes: NodeLike[] | null;
  activeRun: boolean;
  latestDraft: string | null;
  styleNote: string | null;
  readyReferenceImages: number;
  attachedImages: number;
  /** Brand base language (rule audience language), default en. */
  baseLanguage?: string | null;
};

/** Translation steps' target languages (config.targetLanguage, default th like the node). */
export function workflowTranslationLanguages(nodes: NodeLike[]): string[] {
  const langs = nodes
    .filter((n) => /^translation$|Translation/i.test(String(n.type ?? '')))
    .map((n) => {
      const cfg = (n.config && typeof n.config === 'object' ? n.config : {}) as { targetLanguage?: unknown };
      return typeof cfg.targetLanguage === 'string' && cfg.targetLanguage.trim() ? cfg.targetLanguage.trim().toLowerCase() : 'th';
    });
  return [...new Set(langs)];
}

/** Compact per-turn block: brand -> workflow -> runs -> drafts -> what a run produces, gaps marked. */
export function buildCapabilitySummary(c: CapabilityInput): string {
  const lines = ['## What the current setup can produce (check this before promising anything)'];
  lines.push(`Brand: ${c.brandName}; brand channels: ${c.brandChannels.length ? list(c.brandChannels) : 'none set'}.`);
  if (!c.nodes) {
    lines.push('Workflow: none. A run is impossible until one exists (changeable: apply_default_workflow or generate_workflow).');
  } else {
    const lanes = workflowLanes(c.nodes);
    lines.push(`Workflow produces: ${lanes.length ? lanes.map((l) => `${label(l.lane)} (text + ${l.images ? l.images + ' image' + (l.images > 1 ? 's' : '') : 'no image'})`).join('; ') : 'one post, no channel lanes'}.`);
    const noImg = lanes.filter((l) => !l.images).map((l) => l.lane);
    if (noImg.length) lines.push(`- ${list(noImg)} has no image step: changeable setting (add_workflow_node image_generation on that lane).`);
    const langs = workflowTranslationLanguages(c.nodes);
    lines.push(`Translation: ${langs.length ? `the run also translates to ${langs.join(', ')}` : 'no translation step'} (base language ${c.baseLanguage || 'en'}).`);
  }
  lines.push(`Runs: ${c.activeRun ? 'one running now (wait or cancel_pipeline)' : 'none running'}. Latest draft: ${c.latestDraft ?? 'none'}.`);
  lines.push('- Channels: Instagram, Facebook, LinkedIn, YouTube, TikTok, RedNote are supported; a missing lane is a changeable setting (set_workflow_channels). X/Twitter, Pinterest, Threads, Snapchat, Medium, Reddit: not supported.');
  lines.push('- Images per channel: 1 per image step per run. Several images per channel in one run: not supported; after the run each extra image is generate_more_image (changeable, costs credits).');
  lines.push(`- Reference images: supported, up to 3 plus the logo go to the image step. Ready brand reference images: ${c.readyReferenceImages}; attached in this chat: ${c.attachedImages}. start_generation passes the attached ones and reports how many were used.`);
  lines.push('- Other languages: a Translation step (add_workflow_node translation, config.targetLanguage) makes one extra language per step; start_generation takes languages and reports no_translation_step when a step is missing. After a run, generate_more_translation adds a language to that draft only.');
  lines.push('- Real screenshots placed pixel-exact in a device-frame mockup: not supported (no compositing step); the image step redraws a mockup using the screenshot as reference.');
  lines.push(`- Saved style: ${c.styleNote ? c.styleNote + ' (apply only when the request fits; pass style "none" when the user says not this time)' : 'none'}.`);
  return lines.join('\n');
}

export type Preflight = { youAskedFor: string; willChange: string[]; notPossible: string[]; missingLanguages?: string[] };

/** Compare a request with what the workflow will really do. Empty willChange/notPossible = run as asked. */
export function preflightRequest(input: {
  request: ParsedRequest;
  nodes: NodeLike[];
  attachedImages: number;
  /** Extra languages beyond what the request text said (start_generation languages arg). */
  languages?: string[];
  baseLanguage?: string | null;
}): Preflight {
  const r = input.request;
  const lanes = workflowLanes(input.nodes);
  const laneIds = lanes.map((l) => l.lane);
  const asked: string[] = [];
  if (r.channels.length || r.unsupportedChannels.length) asked.push([...r.channels.map(label), ...r.unsupportedChannels].join(', '));
  if (r.imagesPerChannel) asked.push(`${r.imagesPerChannel} image${r.imagesPerChannel > 1 ? 's' : ''}${r.channels.length > 1 ? ' each' : ''}`);
  else if (r.wantsImages) asked.push('images');
  if (r.wantsMockup) asked.push('mockups');
  if (r.wantsRealScreenshots) asked.push('your real screenshots');
  const base = (input.baseLanguage || 'en').toLowerCase();
  const wantedLangs = [...new Set([...(r.targetLanguages ?? []), ...(input.languages ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean)])];
  if (wantedLangs.length) asked.push(`languages: ${wantedLangs.join(', ')}`);
  if (r.noStyle) asked.push('no saved style');
  else if (r.mentionsStyle) asked.push(`${r.mentionsStyle} style`);

  const willChange: string[] = [];
  const notPossible: string[] = [];
  if (r.channels.length && laneIds.length) {
    const missing = r.channels.filter((c) => !laneIds.includes(c));
    const extra = laneIds.filter((c) => !r.channels.includes(c));
    if (missing.length || extra.length) willChange.push(`Make the workflow post only to ${list(r.channels)} (set_workflow_channels)`);
  }
  if (r.wantsImages) {
    const targets = r.channels.length ? r.channels : laneIds;
    // No lanes: one shared Image step covers every channel.
    const noImg = laneIds.length ? targets.filter((c) => (lanes.find((l) => l.lane === c)?.images ?? 0) === 0) : [];
    if (!laneIds.length && !input.nodes.some((n) => /image_generation|ImageGeneration/i.test(String(n.type ?? '')))) willChange.push('Add an image step (add_workflow_node image_generation)');
    else if (noImg.length) willChange.push(`Add an image step for ${list(noImg)} (add_workflow_node image_generation)`);
  }
  const have = workflowTranslationLanguages(input.nodes);
  const missingLangs = wantedLangs.filter((l) => l !== base && !have.includes(l));
  if (missingLangs.length) willChange.push(`Add a translation step for ${missingLangs.join(', ')} (add_workflow_node translation, config.targetLanguage)`);
  for (const u of r.unsupportedChannels) notPossible.push(`${u}: not a supported channel`);
  if (r.imagesPerChannel && r.imagesPerChannel > 1) notPossible.push(`${r.imagesPerChannel} images per channel in one run: a run makes 1 per channel; I can add more with generate more after it finishes (costs credits)`);
  if (r.wantsRealScreenshots && input.attachedImages === 0) notPossible.push('Your real screenshots: none attached in this chat yet; upload them and I will pass them to the image step');
  if (r.wantsMockup && r.wantsRealScreenshots) notPossible.push('Pixel-exact screenshots inside a device frame: the image step redraws the mockup using your screenshots as reference');
  return { youAskedFor: asked.join(', ') || 'a post', willChange, notPossible, missingLanguages: missingLangs };
}

/** Latest real request in the chat (skips chip clicks and bare yes/ok/go). */
export function latestRequestText(userTexts: string[]): string {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const t = userTexts[i].trim();
    if (/^user choice:/i.test(t)) continue;
    if (/^(yes|y|ok|okay|k|go|go ahead|sure|do it|please|yes please|yep|yeah|start|start post)[.! ]*$/i.test(t)) continue;
    return t;
  }
  return '';
}

/** Ids of images attached in chat messages ([[asset:type:id:url]] markers). */
export function attachedImageAssetIds(userTexts: string[]): string[] {
  const ids: string[] = [];
  for (const t of userTexts) for (const m of t.matchAll(/\[\[asset:(reference_image|logo|image):([^:\]]+):/g)) ids.push(m[2]);
  return [...new Set(ids)];
}
