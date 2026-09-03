import { Injectable, Logger } from '@nestjs/common';
import { toPromptToon } from '../../common/utils/toon.util';
import { safeJsonParse } from '../../common/utils/json-parse.util';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeImageTemplate,
} from '../schemas/workflow-node.schema';
import { ImageTemplateResolverService } from './image-template-resolver.service';

const CLASSIFIABLE_TEMPLATES: NodeImageTemplate[] = [
  NodeImageTemplate.AdCreative,
  NodeImageTemplate.ProductMockup,
  NodeImageTemplate.Infographic,
  NodeImageTemplate.Photorealistic,
  NodeImageTemplate.Lifestyle,
];

const FALLBACK_TEMPLATE = NodeImageTemplate.Photorealistic;

/** Truncate free-text inputs so the classification prompt stays small. */
const MAX_TEXT_LEN = 1200;

function clip(text: string, max = MAX_TEXT_LEN): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

type ClassifyInput = {
  rule: Rule;
  channel?: string;
  contentStyle?: string;
  text: string;
  /** The user's own instruction for this image (if any) — the strongest signal when present. */
  userPrompt?: string;
  provider?: LlmProvider;
};

/**
 * Picks the best-fit image "template" (ad creative, product mockup, etc.) for
 * an `image_generation` node set to `template: 'auto'`. Deliberately a plain
 * LLM classification call rather than keyword rules — `rule.campaign.goals`
 * and `channel.contentStyle` are free text, not enums.
 */
@Injectable()
export class ImageTemplateClassifierService {
  private readonly logger = new Logger(ImageTemplateClassifierService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly templateResolver: ImageTemplateResolverService,
  ) {}

  async classify(input: ClassifyInput): Promise<NodeImageTemplate> {
    const { rule, channel, contentStyle, text, userPrompt, provider } = input;
    const trimmedUserPrompt = userPrompt?.trim();

    const definitions = await this.templateResolver.listActiveDefinitions();

    const prompt = [
      'Choose the single best image template for this marketing image.',
      '',
      'Templates and when to use them:',
      toPromptToon(definitions),
      '',
      `Allowed values: ${CLASSIFIABLE_TEMPLATES.join(', ')}.`,
      '',
      trimmedUserPrompt
        ? `User's explicit request for this image: "${clip(trimmedUserPrompt)}" — treat this as the strongest signal for template choice; it overrides the tone of the content below when the two disagree.`
        : '',
      '',
      `Brand industry: ${rule.brand.industry}`,
      `Brand tone: ${rule.brand.brandTone.join(', ')}`,
      `Campaign goals: ${rule.campaign.goals.join(', ')}`,
      `Audience: ${rule.audience.description}`,
      '',
      channel ? `Target channel: ${channel}` : '',
      contentStyle ? `Channel content style: ${contentStyle}` : '',
      '',
      `Content this image accompanies: "${clip(text)}"`,
      '',
      'Return only valid JSON in the form {"template": "<one of the allowed values>"}.',
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
          'You are a creative director choosing the right visual style for a marketing image. Return only valid JSON.',
        ],
        ['human', prompt],
      ]);

      const responseText =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      const parsed = safeJsonParse(responseText) as {
        template?: unknown;
      } | null;
      const candidate = parsed?.template;
      if (
        typeof candidate === 'string' &&
        CLASSIFIABLE_TEMPLATES.includes(candidate as NodeImageTemplate)
      ) {
        return candidate as NodeImageTemplate;
      }
    } catch (err) {
      this.logger.warn(
        `Image template classification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return FALLBACK_TEMPLATE;
  }
}
