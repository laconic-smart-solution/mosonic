import { Injectable, Logger } from '@nestjs/common';

import { safeJsonParse } from '../../common/utils/json-parse.util';
import { LlmService } from '../../llm/llm.service';

import type { Rule } from '../../rule/schemas/rule.schema';

import {
  LlmProvider,
  NodeImageTemplate,
} from '../schemas/workflow-node.schema';

export type ImageVisualBrief = {
  /** The primary visible subject. */
  subject: string;

  /** What the subject is visibly doing. */
  action: string;

  /** Physical location and background. */
  environment: string;

  /** Framing, subject placement, negative space and visual hierarchy. */
  composition: string;

  /** Shot type, perspective, focal-length feel and depth of field. */
  camera: string;

  /** Light source, direction, softness, contrast and time of day. */
  lighting: string;

  /** Photographic / artistic treatment. */
  visualStyle: string;

  /** Dominant and supporting colors. */
  colorPalette: string;

  /** Emotional visual atmosphere. */
  mood: string;

  /** Supporting physical objects only. */
  props: string;

  /** Concrete visual problems to avoid. */
  avoid: string;

  /**
   * Exact text/labels to render.
   * Only populated for infographic templates.
   */
  textLabels: string;
};

const BRIEF_FIELDS: (keyof ImageVisualBrief)[] = [
  'subject',
  'action',
  'environment',
  'composition',
  'camera',
  'lighting',
  'visualStyle',
  'colorPalette',
  'mood',
  'props',
  'avoid',
  'textLabels',
];

/**
 * Keep the source copy small.
 *
 * The visual brief model does not need the entire marketing document.
 * It only needs enough content to understand the campaign message.
 */
const MAX_TEXT_LEN = 1400;

function clip(text: string, max = MAX_TEXT_LEN): string {
  const value = text.trim();

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
}

/**
 * Template-specific visual direction.
 *
 * The template is intentionally kept separate from the actual scene.
 *
 * Template = HOW the image should be designed.
 * Visual brief = WHAT this particular image contains.
 */
const IMAGE_TEMPLATE_VISUAL_STRATEGY: Partial<
  Record<NodeImageTemplate, string>
> = {
  [NodeImageTemplate.AdCreative]: [
    'Create a commercial advertising composition.',
    'Use one dominant focal subject.',
    'Create a strong visual hierarchy that works at mobile size.',
    'Reserve approximately 30% clean negative space for later text overlay.',
    'Do not place headline copy or advertising text inside the scene.',
  ].join('\n'),

  [NodeImageTemplate.ProductMockup]: [
    'Create a product-focused commercial image.',
    'The product must be the dominant visual element.',
    'Use controlled studio-quality lighting.',
    'Keep the background simple and uncluttered.',
    'Show believable product proportions, materials, surfaces and reflections.',
  ].join('\n'),

  [NodeImageTemplate.Infographic]: [
    'Create a structured professional infographic.',
    'Use a clear visual hierarchy and generous spacing.',
    'Every graphic element must correspond to real information from the source.',
    'Extract 3-5 concrete labels, numbers or steps when they genuinely exist.',
    'Never invent statistics, labels, steps or claims.',
    'Only populate textLabels with text that should actually appear in the image.',
  ].join('\n'),

  [NodeImageTemplate.Photorealistic]: [
    'Create a physically believable photograph.',
    'Prioritize realistic anatomy, perspective, materials, lighting and depth.',
    'Use natural photographic detail rather than artificial-looking CGI detail.',
  ].join('\n'),

  [NodeImageTemplate.Lifestyle]: [
    'Create an authentic lifestyle photograph.',
    'Use believable people, natural expressions and realistic body language.',
    'Show genuine interaction rather than a posed stock-photo appearance.',
    'The environment should contribute to the story.',
  ].join('\n'),
};

/**
 * Channel-specific composition guidance.
 *
 * Keep this focused on composition rather than marketing strategy.
 */
const CHANNEL_COMPOSITION_STRATEGY: Record<string, string> = {
  instagram: [
    'Prefer vertical or square framing.',
    'Use one strong focal point.',
    'Make the subject immediately readable on a mobile screen.',
    'Use visually appealing but controlled color.',
  ].join(' '),

  facebook: [
    'Prefer balanced landscape or square framing.',
    'Use a clear focal subject.',
    'Keep important visual information readable at small feed sizes.',
  ].join(' '),

  linkedin: [
    'Prefer clean landscape composition.',
    'Use restrained visual styling.',
    'Maintain a polished professional photographic appearance.',
  ].join(' '),

  youtube: [
    'Design like a YouTube thumbnail.',
    'Use a strong dominant subject.',
    'Use dramatic framing and clear foreground/background separation.',
    'Make the primary subject readable at small preview sizes.',
  ].join(' '),

  tiktok: [
    'Prefer vertical framing.',
    'Use a dynamic focal composition.',
    'Make the subject immediately recognizable on a mobile screen.',
  ].join(' '),

  rednote: [
    'Prefer vertical or editorial-friendly framing.',
    'Use an aspirational lifestyle/editorial aesthetic.',
    'Favor curated composition, natural materials and visually pleasing environments.',
  ].join(' '),
};

const DEFAULT_CHANNEL_COMPOSITION_STRATEGY = [
  'Use a clear focal subject.',
  'Keep the composition balanced and easy to understand.',
  'Make important visual information readable at small sizes.',
].join(' ');

type GenerateBriefInput = {
  rule: Rule;
  effectiveTemplate: NodeImageTemplate;
  channel?: string;
  contentStyle?: string;
  text: string;
  provider?: LlmProvider;
};

@Injectable()
export class ImageVisualBriefService {
  private readonly logger = new Logger(ImageVisualBriefService.name);

  constructor(private readonly llm: LlmService) {}

  async generateBrief(
    input: GenerateBriefInput,
  ): Promise<ImageVisualBrief | null> {
    const {
      rule,
      effectiveTemplate,
      channel,
      contentStyle,
      text,
      provider,
    } = input;

    const templateStrategy =
      IMAGE_TEMPLATE_VISUAL_STRATEGY[effectiveTemplate];

    const normalizedChannel = channel?.trim().toLowerCase();

    const channelStrategy = normalizedChannel
      ? (CHANNEL_COMPOSITION_STRATEGY[normalizedChannel] ??
        DEFAULT_CHANNEL_COMPOSITION_STRATEGY)
      : DEFAULT_CHANNEL_COMPOSITION_STRATEGY;

    const brandTone = Array.isArray(rule.brand.brandTone)
      ? rule.brand.brandTone.join(', ')
      : '';

    const prompt = [
      'Convert the marketing content into a concise visual specification for an image generation model.',

      '',
      'ROLE',
      'Think like a photographer, cinematographer and art director.',
      'Think in terms of visible pixels, not marketing strategy.',

      '',
      'CORE RULES',
      '- Translate abstract marketing ideas into concrete visual situations.',
      '- Describe things that can actually be seen.',
      '- Prefer one strong visual concept over many unrelated elements.',
      '- Be specific about people, objects, environment, position, lighting and camera.',
      '- Do not repeat the marketing copy.',
      '- Do not explain your reasoning.',
      '- Do not write marketing copy.',
      '- Do not invent statistics, claims, product features or facts.',
      '- Do not use generic quality words such as "beautiful", "stunning", "professional", "high quality" or "eye-catching" unless paired with a concrete visual instruction.',

      '',
      'CAMPAIGN CONTEXT',
      `Industry: ${rule.brand.industry}`,
      brandTone ? `Brand visual tone: ${brandTone}` : '',
      rule.audience.description
        ? `Audience: ${rule.audience.description}`
        : '',

      '',
      'IMAGE TEMPLATE',
      `Template: ${effectiveTemplate}`,
      templateStrategy ?? '',

      '',
      'DISTRIBUTION',
      channel ? `Channel: ${channel}` : '',
      contentStyle ? `Content style: ${contentStyle}` : '',
      channelStrategy,

      '',
      'SOURCE CONTENT',
      clip(text),

      '',
      'VISUAL FIELD REQUIREMENTS',

      'subject:',
      'Describe the primary visible subject precisely.',
      'If people are present, describe approximate age, appearance, clothing and expression only when useful.',

      '',
      'action:',
      'Describe what the subject is visibly doing.',
      'Use a concrete physical action rather than an abstract concept.',

      '',
      'environment:',
      'Describe the physical location, background and important environmental details.',

      '',
      'composition:',
      'Describe framing, subject placement, foreground/background relationship, visual hierarchy and negative space.',
      'Mention negative space when the template requires room for later copy.',

      '',
      'camera:',
      'Describe shot type, camera height, perspective, focal-length feel and depth of field when useful.',
      'Do not add technical camera details that do not improve the visual result.',

      '',
      'lighting:',
      'Describe the visible light source, direction, softness, contrast and time of day when relevant.',

      '',
      'visualStyle:',
      'Describe the photographic or artistic treatment.',
      'Examples include editorial photography, premium product photography, documentary lifestyle photography, cinematic photography or clean vector infographic.',

      '',
      'colorPalette:',
      'Describe the dominant and supporting colors that should visibly appear.',

      '',
      'mood:',
      'Describe the emotional visual atmosphere in a few words.',

      '',
      'props:',
      'List only physical supporting objects that strengthen the visual concept.',
      'Do not add decorative objects merely to make the scene look detailed.',

      '',
      'avoid:',
      'List concrete visual failure modes such as distorted anatomy, duplicate people, malformed hands, warped objects, artificial skin, unreadable text or cluttered composition.',
      'Do not include abstract business requirements.',

      '',
      'textLabels:',
      effectiveTemplate === NodeImageTemplate.Infographic
        ? [
            'For infographic templates only:',
            'Extract 3-5 real, concise labels, numbers or steps from the source content when available.',
            'Do not invent information.',
            'Use an empty string when there is no real information worth rendering.',
          ].join(' ')
        : 'Return an empty string. Do not generate text for non-infographic images.',

      '',
      'OUTPUT RULES',
      '- Keep every field concise.',
      '- Prefer concrete nouns and visual verbs.',
      '- Avoid repetition between fields.',
      '- The final brief should normally be around 250-400 words total.',
      '- Return ONLY valid JSON.',
      '- Do not wrap the JSON in markdown fences.',

      '',
      'JSON SCHEMA',
      JSON.stringify({
        subject: '',
        action: '',
        environment: '',
        composition: '',
        camera: '',
        lighting: '',
        visualStyle: '',
        colorPalette: '',
        mood: '',
        props: '',
        avoid: '',
        textLabels: '',
      }),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const model = this.llm.getChatModelForPlainText({
        provider,
        temperature: 0.2,
      });

      const result = await model.invoke([
        [
          'system',
          [
            'You are a visual director for an image generation model.',
            'Convert marketing requirements into concrete visual instructions.',
            'Think like a photographer, cinematographer and art director.',
            'Describe only information that can affect the generated image.',
            'Prefer specificity over adjectives.',
            'Prefer one coherent visual concept over multiple concepts.',
            'Return only valid JSON matching the requested schema.',
          ].join(' '),
        ],
        ['human', prompt],
      ]);

      const responseText =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);

      const parsed = safeJsonParse(responseText) as Record<
        string,
        unknown
      > | null;

      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn('Visual brief returned invalid JSON');
        return null;
      }

      const brief = {} as ImageVisualBrief;

      for (const field of BRIEF_FIELDS) {
        const value = parsed[field];

        brief[field] =
          typeof value === 'string'
            ? value.trim()
            : '';
      }

      if (!brief.subject) {
        this.logger.warn('Visual brief did not contain a subject');
        return null;
      }

      /**
       * Safety normalization:
       *
       * Non-infographic templates should never receive image text.
       */
      if (effectiveTemplate !== NodeImageTemplate.Infographic) {
        brief.textLabels = '';
      }

      return brief;
    } catch (err) {
      this.logger.warn(
        `Visual brief generation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );

      return null;
    }
  }
}
