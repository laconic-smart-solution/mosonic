import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { LlmProvider } from '../schemas/workflow-node.schema';

type ComposeDesignDirectionInput = {
  templateName: string;
  templatePrompt: string;
  styleName?: string;
  stylePrompt?: string;
  provider?: LlmProvider;
};

const RULES = [
  'Length: 50-90 words, one flowing paragraph — this direction is one input among several for a later step, not the final prompt.',
  'Merge the two ideas into a single coherent visual direction: how the image is composed AND how it looks, described together as one idea rather than two separate statements.',
  'State each idea exactly once. Never restate the same quality with synonyms.',
  'If the two ideas genuinely conflict (e.g. one implies photographic realism, the other flat illustration), resolve it in favor of the composition idea — the look should adapt to fit the composition, not fight it.',
  "Don't mention any specific subject, product, brand, or content — this direction describes HOW to compose and render an image in the abstract, not WHAT the image is of. That comes later.",
  'Don\'t name the source ideas or explain your reasoning (no "combining X with Y", no meta-commentary). Write it as one direct, concrete instruction.',
].join('\n');

/** Deterministic fallback so a transient LLM failure never removes design guidance from the pipeline. */
function fallbackDirection(templatePrompt: string, stylePrompt?: string): string {
  return [templatePrompt.trim(), stylePrompt?.trim()].filter(Boolean).join(' ');
}

/**
 * Merges the Template (WHAT/composition) and Style (HOW/look) prompts into
 * ONE coherent "design direction" paragraph, resolving any redundancy or
 * conflict between the two BEFORE the user's actual content enters the
 * picture. Keeping this as its own step means the final Prompt Composer only
 * ever sees one already-synthesized direction rather than two raw source
 * texts side by side — which is what caused template/style text to get
 * echoed near-verbatim when both were composed in a single pass.
 */
@Injectable()
export class ImageDesignDirectionService {
  private readonly logger = new Logger(ImageDesignDirectionService.name);

  constructor(private readonly llm: LlmService) {}

  async compose(input: ComposeDesignDirectionInput): Promise<string> {
    const { templateName, templatePrompt, styleName, stylePrompt, provider } =
      input;

    if (!styleName || !stylePrompt) {
      return templatePrompt.trim();
    }

    const prompt = [
      'Merge these two visual ideas into one coherent design direction.',
      '',
      RULES,
      '',
      `Composition idea (${templateName}): ${templatePrompt}`,
      `Look idea (${styleName}): ${stylePrompt}`,
      '',
      'Respond with ONLY the merged direction as plain prose. No preamble, no labels, no quotes around it.',
    ].join('\n');

    try {
      const model = this.llm.getChatModelForPlainText({
        provider,
        temperature: 0.3,
      });
      const result = await model.invoke([
        [
          'system',
          'You are an art director reconciling a composition brief and a visual-style brief into one direction. Respond with plain prose only.',
        ],
        ['human', prompt],
      ]);

      const text =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      const trimmed = text.trim();

      return trimmed.length > 0
        ? trimmed
        : fallbackDirection(templatePrompt, stylePrompt);
    } catch (err) {
      this.logger.warn(
        `Design direction composition failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return fallbackDirection(templatePrompt, stylePrompt);
    }
  }
}
