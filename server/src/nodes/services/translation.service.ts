import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeFormalityLevel,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  TranslationInput,
} from '../types/node-execution.types';

type NormalizedTranslationConfig = {
  provider?: LlmProvider;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  formalityLevel: NodeFormalityLevel;
};

function normalizeTranslationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedTranslationConfig {
  const c = config ?? {};
  return {
    provider:
      c.provider && Object.values(LlmProvider).includes(c.provider)
        ? c.provider
        : undefined,
    model: typeof c.model === 'string' ? c.model : 'gpt-4o',
    sourceLanguage:
      typeof c.sourceLanguage === 'string' ? c.sourceLanguage : 'en',
    targetLanguage:
      typeof c.targetLanguage === 'string' ? c.targetLanguage : 'th',
    formalityLevel:
      c.formalityLevel === NodeFormalityLevel.Formal
        ? NodeFormalityLevel.Formal
        : NodeFormalityLevel.Casual,
  };
}

function buildSystemPrompt(
  rule: Rule,
  config: NormalizedTranslationConfig,
): string {
  return [
    'You are a professional translator and native copywriter.',
    'You do not translate word for word.',
    'You transcreate — preserving meaning, emotion, and brand voice in the target language.',
    'The output must feel natural to a native speaker, not like a translation.',
    '',
    '=== BRAND CONTEXT ===',
    `Brand name: ${rule.brand.brandName}`,
    `Brand tone: ${rule.brand.brandTone.join(', ')}`,
    `Brand voice: ${rule.brand.brandVoice}`,
    `Call to action: ${rule.brand.callToAction}`,
    '',
    '=== TRANSLATION SETTINGS ===',
    `Source language: ${config.sourceLanguage}`,
    `Target language: ${config.targetLanguage}`,
    `Formality level: ${config.formalityLevel}`,
    config.formalityLevel === NodeFormalityLevel.Formal
      ? 'Use formal register. Professional and respectful tone.'
      : 'Use casual register. Friendly, warm, conversational tone.',
    '',
    '=== AUDIENCE ===',
    `Target audience: ${rule.audience.description}`,
    `Location: ${rule.audience.location.join(', ')}`,
    '',
    '=== GUIDELINES ===',
    `Always include: ${rule.contentGuidelines.requiredElements.join(', ')}`,
    `Never: ${rule.contentGuidelines.donts.join(', ')}`,
    '',
    '=== OUTPUT ===',
    'Return only the translated content.',
    'No explanation, no preamble, no original text.',
    'Preserve formatting — if original has line breaks, keep them.',
    'Keep brand name, product names, and CTAs as defined — do not translate them.',
    `Keep these words untranslated: ${rule.brand.brandName}, ${rule.brand.callToAction}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHumanPrompt(
  text: string,
  targetLanguage: string,
  userPrompt?: string,
): string {
  return [
    `Translate the following content to ${targetLanguage}:`,
    '',
    text,
    '',
    userPrompt ? `Additional instruction: ${userPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))
      .join('\n');
  }
  if (content == null) {
    return '';
  }
  return String(content);
}

function chunkToString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : typeof (part as { text?: unknown })?.text === 'string'
            ? ((part as { text: string }).text ?? '')
            : '',
      )
      .join('');
  }
  if (content == null) {
    return '';
  }
  return String(content);
}

@Injectable()
export class TranslationService {
  constructor(private readonly llm: LlmService) {}

  async translate(
    input: TranslationInput,
  ): Promise<{ translatedText: string }> {
    const { rule, previousOutputs, userPrompt, config } = input;
    const normalized = normalizeTranslationConfig(config);
    const systemPrompt = buildSystemPrompt(rule, normalized);
    const humanPrompt = buildHumanPrompt(
      previousOutputs.text,
      normalized.targetLanguage,
      userPrompt,
    );

    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: 0.2,
    });
    const res = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);
    const translatedText = messageContentToString(res.content).trim();
    return { translatedText };
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Translation requires `rule` on NodeExecutionInput',
      );
    }
    const sourceText = input.previousOutputs?.text?.trim();
    if (!sourceText) {
      throw new UnprocessableEntityException(
        'Translation requires `previousOutputs.text` (text from node 1)',
      );
    }

    const normalized = normalizeTranslationConfig(input.config ?? {});
    const systemPrompt = buildSystemPrompt(input.rule, normalized);
    const humanPrompt = buildHumanPrompt(
      sourceText,
      normalized.targetLanguage,
      input.userPrompt,
    );
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: 0.2,
    });
    let translatedText = '';
    if (input.onChunk) {
      const stream = await model.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);
      for await (const chunk of stream) {
        const piece = chunkToString(chunk.content);
        if (piece) {
          input.onChunk(piece);
          translatedText += piece;
        }
      }
      translatedText = translatedText.trim();
    } else {
      const translated = await this.translate({
        rule: input.rule,
        contentPrompt: input.contentPrompt ?? '',
        previousOutputs: { text: sourceText },
        userPrompt: input.userPrompt,
        config: input.config ?? {},
      });
      translatedText = translated.translatedText;
    }
    return { output: translatedText };
  }
}
