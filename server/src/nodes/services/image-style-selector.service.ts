import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { toPromptToon } from '../../common/utils/toon.util';
import { safeJsonParse } from '../../common/utils/json-parse.util';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import { LlmProvider } from '../schemas/workflow-node.schema';
import { ImageDesignStyleRepositoryService } from './image-design-style-repository.service';

const DEFAULT_STYLE_KEY = 'minimalism';
const MAX_TEXT_LEN = 1200;

function clip(text: string, max = MAX_TEXT_LEN): string {
  const value = text.trim();

  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

type SelectStyleInput = {
  rule: Rule;
  userPrompt: string;
  negativePrompt?: string;
  templateName: string;
  channel?: string;
  provider?: LlmProvider;
};

/**
 * Selects ONE predefined design style for an image.
 *
 * Responsibilities:
 * - Detect an explicit style requested by the user.
 * - Otherwise ask the LLM to select one style from the active style library.
 * - Never invent a new style.
 * - Never generate or modify a style prompt.
 *
 * The selected style is resolved separately by
 * ImageDesignStyleRepositoryService.
 */
@Injectable()
export class ImageStyleSelectorService {
  private readonly logger = new Logger(ImageStyleSelectorService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly styleRepository: ImageDesignStyleRepositoryService,
  ) {}

  async select(input: SelectStyleInput): Promise<string> {
    const {
      rule,
      userPrompt,
      negativePrompt,
      templateName,
      channel,
      provider,
    } = input;

    const styles = await this.styleRepository.listActive();

    if (styles.length === 0) {
      throw new InternalServerErrorException(
        'No active image design styles are configured.',
      );
    }

    const allowedKeys = new Set(styles.map((style) => style.key));

    const fallbackKey = this.resolveFallbackStyle(styles);

    /**
     * If the user explicitly requests a style, do not spend an LLM call
     * trying to rediscover something we already know.
     */
    const explicitStyle = this.findExplicitStyle(userPrompt, styles);

    if (explicitStyle) {
      return explicitStyle;
    }

    const prompt = this.buildSelectionPrompt({
      rule,
      userPrompt,
      negativePrompt,
      templateName,
      channel,
      styles,
    });

    try {
      const model = this.llm.getChatModelForPlainText({
        provider,
        temperature: 0.2,
      });

      const result = await model.invoke([
        [
          'system',
          [
            'You are a visual art director selecting a predefined design style.',
            'Your job is classification, not creative style generation.',
            'Choose exactly one style from the provided list.',
            'Never invent, rename, combine, or modify a style.',
            'The explicit user request has the highest priority.',
            'Return only valid JSON.',
          ].join(' '),
        ],
        ['human', prompt],
      ]);

      const responseText =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);

      const parsed = safeJsonParse(responseText) as {
        style?: unknown;
      } | null;

      const candidate =
        typeof parsed?.style === 'string'
          ? normalize(parsed.style)
          : null;

      if (candidate && allowedKeys.has(candidate)) {
        return candidate;
      }

      this.logger.warn(
        `AI returned an invalid image style: ${String(parsed?.style)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Image style selection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return fallbackKey;
  }

  private resolveFallbackStyle(
    styles: Array<{ key: string }>,
  ): string {
    const defaultStyle = styles.find(
      (style) => normalize(style.key) === DEFAULT_STYLE_KEY,
    );

    return defaultStyle?.key ?? styles[0].key;
  }

  private findExplicitStyle(
    userPrompt: string,
    styles: Array<{
      key: string;
      name: string;
    }>,
  ): string | null {
    const normalizedPrompt = normalize(userPrompt);

    if (!normalizedPrompt) {
      return null;
    }

    /**
     * Prefer longer names first so a more specific style name wins.
     *
     * Example:
     * "retro futuristic"
     * should not accidentally match "retro"
     * before checking "retro futuristic" if such a style exists.
     */
    const sortedStyles = [...styles].sort(
      (a, b) =>
        normalize(b.name).length - normalize(a.name).length,
    );

    for (const style of sortedStyles) {
      const normalizedName = normalize(style.name);
      const normalizedKey = normalize(style.key);

      if (
        this.containsStylePhrase(normalizedPrompt, normalizedName) ||
        this.containsStylePhrase(normalizedPrompt, normalizedKey)
      ) {
        this.logger.debug(
          `Explicit image style detected from user prompt: ${style.key}`,
        );

        return style.key;
      }
    }

    return null;
  }

  private containsStylePhrase(
    prompt: string,
    style: string,
  ): boolean {
    if (!style) {
      return false;
    }

    /**
     * Normalize hyphens back to spaces for natural user input.
     *
     * Example:
     * "swiss-design" → "swiss design"
     * "swiss design" → "swiss design"
     */
    const phrase = style.replace(/-/g, ' ');

    const promptWithSpaces = prompt.replace(/-/g, ' ');

    return ` ${promptWithSpaces} `.includes(` ${phrase} `);
  }

  private buildSelectionPrompt(input: {
    rule: Rule;
    userPrompt: string;
    negativePrompt?: string;
    templateName: string;
    channel?: string;
    styles: Array<{
      key: string;
      name: string;
      description: string;
    }>;
  }): string {
    const {
      rule,
      userPrompt,
      negativePrompt,
      templateName,
      channel,
      styles,
    } = input;

    return [
      'Select the single best design style for the requested image.',
      '',
      'Priority:',
      '1. Follow the user request.',
      '2. Satisfy the image template.',
      '3. Preserve important brand identity.',
      '4. Consider the target channel.',
      '5. Use the negative prompt only as a constraint, not as the main style signal.',
      '',
      'Do not invent a new visual style.',
      'Do not combine multiple styles.',
      'Do not select a style merely because it sounds fashionable.',
      '',
      `Brand: ${rule.brand.brandName}`,
      `Industry: ${rule.brand.industry}`,
      `Brand tone: ${rule.brand.brandTone.join(', ')}`,
      '',
      `Template: ${templateName}`,
      channel ? `Target channel: ${channel}` : '',
      '',
      `User request: "${clip(userPrompt || '(none given)')}"`,
      negativePrompt
        ? `Negative constraints: "${clip(negativePrompt)}"`
        : '',
      '',
      'Available styles:',
      toPromptToon(
        styles.map((style) => ({
          key: style.key,
          name: style.name,
          description: style.description,
        })),
      ),
      '',
      'Return only valid JSON:',
      '{"style":"<one of the listed style keys>"}',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
