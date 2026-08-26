import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeOutputFormat,
  NodeSummaryLength,
  NodeTextTone,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import {
  extractUsageFromAiMessage,
  extractUsageFromStreamChunk,
} from '../langchain-usage.util';
import { formatGenerationTemporalContext } from './generation-temporal-context.util';
import { sanitizeGeneratedPostText } from './generated-text-guardrails.util';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  PreviousOutputs,
  TextGenerationInput,
} from '../types/node-execution.types';

type NormalizedTextConfig = {
  provider?: LlmProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  outputFormat: NodeOutputFormat;
  tone: NodeTextTone;
  textLength: NodeSummaryLength;
};

function normalizeTextGenerationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedTextConfig {
  const c = config ?? {};
  return {
    provider:
      c.provider && Object.values(LlmProvider).includes(c.provider)
        ? c.provider
        : undefined,
    model: typeof c.model === 'string' ? c.model : 'gpt-4o',
    temperature: typeof c.temperature === 'number' ? c.temperature : 0.7,
    maxTokens: typeof c.maxTokens === 'number' ? c.maxTokens : 500,
    outputFormat:
      c.outputFormat === NodeOutputFormat.Bullets ||
      c.outputFormat === NodeOutputFormat.Caption
        ? c.outputFormat
        : NodeOutputFormat.Paragraph,
    tone:
      c.tone && Object.values(NodeTextTone).includes(c.tone)
        ? c.tone
        : NodeTextTone.Professional,
    textLength:
      c.textLength === NodeSummaryLength.Short ||
      c.textLength === NodeSummaryLength.Long
        ? c.textLength
        : NodeSummaryLength.Medium,
  };
}

function buildSystemPrompt(
  rule: Rule,
  config: NormalizedTextConfig,
  previousOutputs?: PreviousOutputs,
): string {
  const intelligenceBrief =
    previousOutputs?.intelligenceBrief?.trim() ||
    previousOutputs?.intelligenceHints?.trim() ||
    null;

  return [
    'You are a professional content writer.',
    'Write content strictly following the brand guidelines below.',
    'Never break character or deviate from the brand tone.',
    '',
    formatGenerationTemporalContext(),
    intelligenceBrief
      ? ''
      : [
          'No live intelligence brief was provided for this run.',
          "Content must still reflect today's date above; do not invent outdated campaign years or stale news.",
        ].join(' '),
    '',
    '=== BRAND ===',
    `Brand name: ${rule.brand.brandName}`,
    `Industry: ${rule.brand.industry}`,
    `Brand description: ${rule.brand.brandDescription}`,
    `Tone: ${rule.brand.brandTone.join(', ')}`,
    `Voice: ${rule.brand.brandVoice}`,
    `Call to action: ${rule.brand.callToAction}`,
    '',
    '=== AUDIENCE ===',
    `Description: ${rule.audience.description}`,
    `Age range: ${rule.audience.ageRange.min} - ${rule.audience.ageRange.max}`,
    `Location: ${rule.audience.location.join(', ')}`,
    `Language: ${rule.audience.language}`,
    `Interests: ${rule.audience.interests.join(', ')}`,
    `Pain points: ${rule.audience.painPoints.join(', ')}`,
    '',
    '=== CAMPAIGN ===',
    `Goals: ${rule.campaign.goals.join(', ')}`,
    `Keywords to include naturally: ${rule.campaign.keywords.join(', ')}`,
    `Hashtags: ${rule.campaign.hashtagStrategy.join(', ')}`,
    '',
    '=== CONTENT GUIDELINES ===',
    `Do: ${rule.contentGuidelines.dos.join(', ')}`,
    `Do not: ${rule.contentGuidelines.donts.join(', ')}`,
    `Always include: ${rule.contentGuidelines.requiredElements.join(', ')}`,
    `SEO keywords: ${rule.contentGuidelines.seoGuidelines.primaryKeywords.join(', ')}`,
    '',
    '=== RESTRICTIONS ===',
    rule.brand.brandRestrictions.join('\n'),
    '',
    '=== VOICE FOR THIS NODE ===',
    `Writing tone: ${config.tone}`,
    config.tone === NodeTextTone.Professional
      ? 'Polished, credible, business-appropriate.'
      : config.tone === NodeTextTone.Casual
        ? 'Relaxed, conversational, approachable.'
        : config.tone === NodeTextTone.Friendly
          ? 'Warm, welcoming, human.'
          : config.tone === NodeTextTone.Formal
            ? 'Precise, elevated register; avoid slang.'
            : 'Clever, playful, but still on-brand.',
    `Target length band: ${config.textLength}`,
    config.textLength === NodeSummaryLength.Short
      ? 'Keep the piece brief (roughly a few sentences).'
      : config.textLength === NodeSummaryLength.Medium
        ? 'Standard length for the chosen output format.'
        : 'Allow richer detail while staying within maxTokens.',
    '',
    '=== OUTPUT FORMAT ===',
    `Format: ${config.outputFormat}`,
    config.outputFormat === NodeOutputFormat.Paragraph
      ? 'Write in flowing paragraph form.'
      : config.outputFormat === NodeOutputFormat.Bullets
        ? 'Write as concise bullet points.'
        : 'Write as a short punchy social media caption.',
    `Maximum length: ${config.maxTokens} tokens.`,
    'Do not include any explanation, preamble, or metadata.',
    'Return only the content itself.',
    'If this copy may feed AI-generated video: do not include phone numbers, emails, URLs, addresses, QR codes, or instructions to show on-screen text or logos; keep CTAs generic without display-ready contact strings.',
    intelligenceBrief
      ? [
          '',
          '=== INTELLIGENCE BRIEF (current market context) ===',
          intelligenceBrief,
          '',
          'Use this brief to make the content timely, relevant, and differentiated.',
          'Prioritize gap opportunities and recommended angles when present.',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHumanPrompt(
  contentPrompt: string,
  previousOutputs?: PreviousOutputs,
): string {
  const kw = previousOutputs?.keywords?.trim();
  return [
    `Content request: ${contentPrompt}`,
    kw
      ? `Target keywords from the keyword planner (use naturally in the copy, do not stuff):\n${kw}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
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
export class TextGenerationService {
  private readonly logger = new Logger(TextGenerationService.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Brand-grounded copy generation. Use from tests or when you already have
   * `rule` + `contentPrompt` without wrapping in {@link NodeExecutionInput}.
   */
  async generateText(input: TextGenerationInput): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const { rule, contentPrompt, config, previousOutputs } = input;
    const normalized = normalizeTextGenerationConfig(config);
    const systemPrompt = buildSystemPrompt(rule, normalized, previousOutputs);
    const humanPrompt = buildHumanPrompt(contentPrompt, previousOutputs);

    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: normalized.temperature,
      maxTokens: normalized.maxTokens,
    });

    const res = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);

    const text = sanitizeGeneratedPostText(
      messageContentToString(res.content).trim(),
    );
    const usage = extractUsageFromAiMessage(res);
    return usage ? { text, usage } : { text };
  }

  /**
   * Orchestration entry: requires `rule` and `contentPrompt` on the input
   * (populate from pipeline + rule document when the runner is implemented).
   */
  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Text generation requires `rule` on NodeExecutionInput',
      );
    }
    const contentPrompt = input.contentPrompt ?? '';
    const normalized = normalizeTextGenerationConfig(input.config ?? {});
    const hasIntelligenceBrief = Boolean(
      input.previousOutputs?.intelligenceBrief?.trim() ||
      input.previousOutputs?.intelligenceHints?.trim(),
    );
    if (!hasIntelligenceBrief) {
      this.logger.warn(
        `Text generation without intelligence brief | pipeline=${input.pipelineRef ?? 'n/a'} | node=${input.nodeId ?? 'n/a'}`,
      );
    }
    const systemPrompt = buildSystemPrompt(
      input.rule,
      normalized,
      input.previousOutputs,
    );
    const humanPrompt = buildHumanPrompt(contentPrompt, input.previousOutputs);
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: normalized.temperature,
      maxTokens: normalized.maxTokens,
    });
    let text = '';
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    if (input.onChunk) {
      const stream = await model.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);
      for await (const chunk of stream) {
        const piece = chunkToString(chunk.content);
        if (piece) {
          input.onChunk(piece);
          text += piece;
        }
        const u = extractUsageFromStreamChunk(chunk);
        if (u) {
          usage = u;
        }
      }
      text = sanitizeGeneratedPostText(text.trim());
    } else {
      const generated = await this.generateText({
        rule: input.rule,
        contentPrompt,
        config: input.config ?? {},
        previousOutputs: input.previousOutputs,
      });
      text = generated.text;
      usage = generated.usage;
    }
    return usage ? { output: text, usage } : { output: text };
  }
}
