import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeImageTemplate,
} from '../schemas/workflow-node.schema';

const MAX_TEXT_LEN = 1400;
/** Marketing copy is a source of *ideas*, not text to summarize in full — kept short so the model synthesizes instead of echoing adjectives from the copy. */
const MAX_MARKETING_TEXT_LEN = 500;

function clip(text: string, max = MAX_TEXT_LEN): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

type ComposePromptInput = {
  rule: Rule;
  /** The user's original run instruction — highest priority per the doc's input hierarchy. */
  userPrompt: string;
  negativePrompt?: string;
  /** Template + Style already merged into one coherent direction (see ImageDesignDirectionService). */
  designDirection: string;
  channel?: string;
  /** The generated marketing copy this image accompanies. */
  marketingText: string;
  effectiveTemplate: NodeImageTemplate;
  provider?: LlmProvider;
};

const PRIORITY_RULES = [
  'Priority order when inputs conflict (highest first):',
  "1. The user's explicit request",
  '2. Negative constraints (things to avoid)',
  '3. Rule / content accuracy',
  '4. The design direction below',
  '5. Brand identity',
  '6. Your own creative judgment',
].join('\n');

const LENGTH_AND_FOCUS_RULES = [
  'Length: 80-130 words. Never exceed ~150 words. A short, sharp prompt beats a long, thorough one.',
  'Structure your thinking in this order, but write it as ONE flowing paragraph, not a list or labeled sections: subject -> concept/action -> environment -> composition -> style cues -> lighting -> color -> hard constraints.',
  'State each idea exactly once. Never restate the same quality with synonyms — if you say "futuristic", do not also say "advanced", "sleek", and "polished" for the same thing. Pick the one best word.',
  'No precise numbers, fractions, or percentages (no "one third", no measurements) — describe framing qualitatively instead ("with clear space to one side").',
  'No production or marketing meta-language ("mobile-first", "reads instantly", "premium ad", "high-converting", "eye-catching", "scroll-stopping") — describe only what is visible in the frame, never why it works commercially.',
  'The design direction below describes an idea, not text to copy — restate it in your own brief words, do not quote or closely paraphrase it.',
  'Show, don\'t tell: never name an abstract concept ("suggests progress", "conveys mastery", "represents growth", "rather than a literal diagram") — describe the concrete, observable detail that makes the viewer infer it instead (posture, action, expression, object state, environment). Never explain what the image avoids or is not.',
  'Write one complete, finished description. Never use ellipses (...) or placeholder/unfinished phrasing.',
].join('\n');

const LITERAL_METAPHOR_RULE = [
  'The source content may use abstract, technical, or metaphorical business language (product names, jargon, metaphors like "skill tree", "roadmap", "ecosystem", "AI", "platform").',
  'Do NOT render these literally as diagrams, charts, UI screens, icon sets, network graphs, or floating data nodes.',
  'Instead, translate the underlying human feeling or outcome (progress, mastery, focus, connection, relief, achievement) into ONE concrete real-world scene with real objects, people, or places.',
  'That scene must still clearly read as belonging to the brand\'s actual industry (given below) — include at least one specific, recognizable object, setting, tool, or activity a viewer would associate with that industry. Do not resolve this into a generic abstract shape, empty studio space, or a scene so stripped-down it could equally be an ad for any brand in any industry — staying "concrete" only counts if the industry is still recognizable without the caption.',
  'The only exception is the Infographic template, where showing real provided data as a literal diagram is the actual point.',
].join('\n');

const COMPOSER_RULES = [
  "Don't:",
  '- Invent products, facts, or statistics not present in the source content.',
  '- Add random unrelated objects.',
  '- Explain your reasoning or mention these instructions.',
  '- Introduce a second design direction on top of the one given.',
].join('\n');

/**
 * Turns Rule + user request + negative prompt + a pre-merged design
 * direction (Template + Style, see ImageDesignDirectionService) into ONE
 * short, coherent natural-language image prompt — plain prose, not a
 * labeled field dump and not a marketing brief. A prompt that tries to
 * carry every input forward verbatim reads as generic (mood adjectives
 * pile up, source text gets echoed near-verbatim, abstract product
 * language like "skill tree" gets rendered as a literal diagram) — this
 * composer is deliberately told to select and compress, not transcribe.
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
      designDirection,
      channel,
      marketingText,
      effectiveTemplate,
      provider,
    } = input;

    const textInstruction =
      effectiveTemplate === NodeImageTemplate.Infographic
        ? 'This is an infographic: use only exact labels, numbers, and steps that are actually present in the source content below — do not invent additional labels, change numbers, or add claims. The source content likely has more points than can fit cleanly: pick at most 3-4 of the most important ones rather than including everything. A focused infographic with a few clear points beats a crowded one trying to cover the whole source. If the source content has no concrete data to show, keep the layout structural without inventing text.'
        : 'Do not include any text, captions, headlines, logos, watermarks, or UI elements in the image.';

    const fitInstruction =
      'Every element, including all text and layout blocks, must fit fully within the frame with comfortable margin on every side. Nothing may be cropped, cut off, or extend past the edge of the image.';

    const prompt = [
      'Compose one short, precise image-generation prompt from the inputs below — a strong prompt is concise, not exhaustive.',
      '',
      LENGTH_AND_FOCUS_RULES,
      '',
      PRIORITY_RULES,
      '',
      LITERAL_METAPHOR_RULE,
      '',
      COMPOSER_RULES,
      '',
      `User request: "${clip(userPrompt || '(none given — infer intent from the content below)')}"`,
      negativePrompt ? `Negative prompt (avoid): ${negativePrompt}` : '',
      '',
      `Brand: ${rule.brand.brandName}`,
      `Industry: ${rule.brand.industry}`,
      `Brand tone (use as an undertone, not a list of adjectives to insert): ${rule.brand.brandTone.join(', ')}`,
      '',
      `Design direction (restate briefly, do not quote): ${designDirection}`,
      '',
      channel ? `Target channel: ${channel}` : '',
      '',
      'Text handling:',
      textInstruction,
      '',
      'Framing:',
      fitInstruction,
      '',
      `Content this image accompanies: "${clip(marketingText, MAX_MARKETING_TEXT_LEN)}"`,
      '',
      'Respond with ONLY the final image prompt as plain prose. No preamble, no labels, no quotes around it.',
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
          'You are an award-winning creative director writing short, precise image-generation prompts for commercial photography and design. You select and compress — you never transcribe your inputs. Respond with plain prose only.',
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
