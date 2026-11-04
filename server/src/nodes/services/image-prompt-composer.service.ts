import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeImageTemplate,
} from '../schemas/workflow-node.schema';

const MAX_TEXT_LEN = 1400;
const MAX_MARKETING_TEXT_LEN = 900;

function clip(text: string, max = MAX_TEXT_LEN): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

function joinList(values: string[] | undefined, fallback = '(not specified)'): string {
  const joined = (values ?? []).map((v) => v.trim()).filter(Boolean).join(', ');
  return joined || fallback;
}

function optionalLine(label: string, value: string | undefined): string {
  const v = value?.trim();
  return v ? `${label}: ${v}` : '';
}

type ComposePromptInput = {
  rule: Rule;
  /** The user's original run instruction — highest priority per the input hierarchy. */
  userPrompt: string;
  negativePrompt?: string;
  templateName: string;
  templatePrompt: string;
  styleName?: string;
  stylePrompt?: string;
  channel?: string;
  /** The generated marketing copy this image accompanies. */
  marketingText: string;
  effectiveTemplate: NodeImageTemplate;
  provider?: LlmProvider;
  /** Compressed run attachment notes. */
  sourcePackNotes?: string;
  /**
   * When set, the prompt targets images.edit — list Image 1..N with roles
   * (product insert, logo composite, style transfer, enhance).
   */
  referenceImages?: Array<{ index: number; label: string; role: string }>;
};

const PRIORITY_RULES = [
  'Priority order when inputs conflict (highest first):',
  "1. The user's explicit request",
  '2. Brand identity, target audience, and content accuracy',
  '3. Negative constraints (things to avoid)',
  '4. Image type / composition notes',
  '5. Visual style (look and finish only — never replace the subject or audience)',
  '6. Your own creative judgment',
].join('\n');

const OUTPUT_FORMAT_RULES = [
  'Write the image-generation prompt as labeled sections, not one compressed paragraph.',
  'Use exactly these labels, each on its own line:',
  'Use:',
  'Subject:',
  'People / audience:',
  'Setting:',
  'Composition:',
  'Lighting:',
  'Style:',
  'Must include:',
  'Must not:',
  'For infographics or ads that need in-image copy, also include a line `Text in image:` with the exact words in quotes.',
  'Be specific and complete. Typical length is 180-320 words. Do not starve the prompt to look concise.',
  'Every section must describe visible pixels. Name the brand, industry, audience, and a recognizable product, tool, setting, or activity from this brand — not a generic scene that could sell any company.',
].join('\n');

const SUBJECT_RULES = [
  'Keep real products, tools, places, packaging, and brand-recognizable objects literal.',
  'Do not translate the offering into an abstract feeling (progress, mastery, relief) unless the user explicitly asked for metaphor.',
  'Do not replace the product with a unrelated lifestyle tableau.',
  'People in the scene must match the target audience (age range, location cues, clothing, setting).',
  'If the template is Photorealistic or Lifestyle, include the word "photorealistic" in Use or Style.',
].join('\n');

const COMPOSER_RULES = [
  "Don't:",
  '- Invent products, facts, or statistics not present in the source content.',
  '- Drop the brand name, industry, or audience from the final prompt.',
  '- Leave large empty overlay regions or unfinished-looking frames.',
  '- Explain your reasoning or mention these instructions.',
  '- Wrap the prompt in quotes or markdown.',
].join('\n');

function formatRuleContext(rule: Rule): string[] {
  const brand = rule.brand;
  const audience = rule.audience;
  const campaign = rule.campaign;
  const age =
    audience?.ageRange &&
    typeof audience.ageRange.min === 'number' &&
    typeof audience.ageRange.max === 'number'
      ? `${audience.ageRange.min}–${audience.ageRange.max}`
      : '';

  return [
    '=== BRAND ===',
    `Brand name: ${brand?.brandName?.trim() || '(not specified)'}`,
    `Industry: ${brand?.industry?.trim() || '(not specified)'}`,
    optionalLine('Brand description', brand?.brandDescription),
    `Tone: ${joinList(brand?.brandTone)}`,
    optionalLine('Voice', brand?.brandVoice),
    optionalLine('Call to action', brand?.callToAction),
    brand?.brandRestrictions?.length
      ? `Restrictions: ${joinList(brand.brandRestrictions)}`
      : '',
    '',
    '=== AUDIENCE (must be visible in the scene) ===',
    optionalLine('Description', audience?.description) ||
      'Description: (not specified)',
    age ? `Age range: ${age}` : '',
    audience?.location?.length
      ? `Location: ${joinList(audience.location)}`
      : '',
    optionalLine('Language', audience?.language),
    audience?.interests?.length
      ? `Interests: ${joinList(audience.interests)}`
      : '',
    audience?.painPoints?.length
      ? `Pain points: ${joinList(audience.painPoints)}`
      : '',
    '',
    '=== CAMPAIGN ===',
    campaign?.goals?.length ? `Goals: ${joinList(campaign.goals)}` : '',
    campaign?.keywords?.length
      ? `Keywords: ${joinList(campaign.keywords)}`
      : '',
  ];
}

/**
 * Turns Rule + user request + template + style into a labeled
 * gpt-image-2 prompt that keeps brand, audience, and subject specific.
 */
@Injectable()
export class ImagePromptComposerService {
  private readonly logger = new Logger(ImagePromptComposerService.name);

  constructor(private readonly llm: LlmService) {}

  async compose(input: ComposePromptInput): Promise<string | null> {
    const {
      rule,
      userPrompt,
      negativePrompt,
      templateName,
      templatePrompt,
      styleName,
      stylePrompt,
      channel,
      marketingText,
      effectiveTemplate,
      provider,
      sourcePackNotes,
      referenceImages,
    } = input;

    const isInfographic = effectiveTemplate === NodeImageTemplate.Infographic;
    const isAd = effectiveTemplate === NodeImageTemplate.AdCreative;
    const isEdit = (referenceImages?.length ?? 0) > 0;
    const hasBrandMark = (referenceImages ?? []).some(
      (image) => image.role === 'brand_mark',
    );

    const textInstruction = isInfographic
      ? 'This is an infographic: put exact labels, numbers, and steps from the source content into `Text in image`, in quotes. Pick at most 3-4 of the most important points. Do not invent labels or change numbers. Fill the frame with a complete, readable layout — no empty unused panels.'
      : isAd
        ? [
            'This is a finished advertising creative, not a background waiting for overlay.',
            'Fill the frame with a complete scene. Do not reserve a blank third of the image.',
            'If a call to action or short headline is present in the brand CTA or source content, render it once in the image: put the exact words in quotes on a `Text in image:` line, with placement and type style (bold sans-serif, high contrast, legible).',
            hasBrandMark
              ? 'Composite the brand_mark reference exactly. No extra slogans, no watermarks, no invented logos.'
              : 'No extra slogans, no watermarks, no unrelated logos.',
          ].join(' ')
        : hasBrandMark
          ? 'Do not include captions, headlines, watermarks, or unrelated UI. Composite the brand_mark reference exactly; do not invent a different mark.'
          : 'Do not include captions, headlines, watermarks, or unrelated UI. Do not invent extra logos. The scene itself must still look finished and fully framed.';

    const referenceBlock = isEdit
      ? [
          'This prompt will be sent to images.edit with the following reference files (in order):',
          ...referenceImages!.map(
            (r) =>
              `Image ${r.index}: "${r.label}" — role=${r.role}. ${roleInstruction(r.role, r.label)}`,
          ),
          'Reference each image by index ("Image 1", "Image 2"). Be explicit about what to transplant, preserve, or restyle.',
          'Add a section `Reference usage:` describing how each Image N is used.',
        ].join('\n')
      : '';

    const prompt = [
      isEdit
        ? 'Compose one image-edit prompt for gpt-image-2 from the inputs below.'
        : 'Compose one image-generation prompt for gpt-image-2 from the inputs below.',
      '',
      OUTPUT_FORMAT_RULES,
      '',
      PRIORITY_RULES,
      '',
      SUBJECT_RULES,
      '',
      COMPOSER_RULES,
      '',
      `User request: "${clip(userPrompt || '(none given — infer the subject from brand and content below)')}"`,
      negativePrompt ? `Negative prompt (avoid): ${negativePrompt}` : '',
      '',
      ...formatRuleContext(rule),
      '',
      sourcePackNotes?.trim()
        ? `Source attachments (facts for this run):\n${clip(sourcePackNotes, 900)}`
        : '',
      '',
      referenceBlock,
      '',
      `Image type: ${templateName}`,
      `Composition notes (apply to THIS brand's subject; do not drop the subject): ${templatePrompt}`,
      styleName
        ? `Visual style (${styleName}) — look/finish only: ${stylePrompt ?? ''}`
        : '',
      channel ? `Target channel: ${channel}` : '',
      '',
      'Text handling:',
      textInstruction,
      '',
      'Framing:',
      'Every subject must sit fully inside the frame with a small margin. Nothing cropped or cut off. The image must look complete, not like a placeholder.',
      '',
      `Content this image accompanies: "${clip(marketingText, MAX_MARKETING_TEXT_LEN)}"`,
      '',
      'Respond with ONLY the labeled image prompt. No preamble.',
    ]
      .filter((line) => line !== '')
      .join('\n');

    try {
      const model = this.llm.getChatModelForPlainText({
        provider,
        temperature: 0.2,
      });
      const result = await model.invoke([
        [
          'system',
          'You write production image-generation prompts for gpt-image-2. Keep brand, audience, and the actual offering specific. Style dresses the subject; it does not replace it. When reference images are listed, instruct how to use each by index. Respond with labeled sections only.',
        ],
        ['human', prompt],
      ]);

      const text =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      const trimmed = text.trim();

      return trimmed.length > 0 ? trimmed : null;
    } catch (err) {
      this.logger.warn(
        `Image prompt composition failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

function roleInstruction(role: string, label?: string): string {
  if (label === 'previous_output' || role === 'enhance') {
    if (label === 'previous_output') {
      return 'This is the current generated creative. Apply the user change; preserve subject, layout, and branding unless they asked to change those.';
    }
    return 'Edit this image per the user request; change only what they asked.';
  }
  switch (role) {
    case 'brand_mark':
      return 'Composite this logo onto the scene; preserve geometry and clean edges.';
    case 'product':
      return 'Keep this product as the hero subject; preserve shape, label, and materials.';
    case 'identity':
      return 'Preserve this person/face likeness exactly; do not redesign identity.';
    case 'style_ref':
      return 'Transfer palette/texture/lighting only — do not copy the subject.';
    default:
      return 'Use only as visual context if needed.';
  }
}
