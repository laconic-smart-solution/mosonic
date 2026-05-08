import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeSummaryLength,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  PreviousOutputs,
  SummarizationInput,
} from '../types/node-execution.types';

type SummaryFormat = 'paragraph' | 'bullets' | 'tldr';

type NormalizedSummarizationConfig = {
  provider?: LlmProvider;
  model: string;
  summaryLength: NodeSummaryLength;
  outputFormat: SummaryFormat;
  sourceNodeRef: string;
};

function normalizeSummarizationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedSummarizationConfig {
  const c = config ?? {};
  const outputFormatValue = (c as Record<string, unknown>).outputFormat;
  const outputFormatRaw =
    typeof outputFormatValue === 'string' ? outputFormatValue : 'paragraph';
  const outputFormat: SummaryFormat =
    outputFormatRaw === 'bullets' || outputFormatRaw === 'tldr'
      ? outputFormatRaw
      : 'paragraph';

  return {
    provider:
      c.provider && Object.values(LlmProvider).includes(c.provider)
        ? c.provider
        : undefined,
    model: typeof c.model === 'string' ? c.model : 'gpt-4o',
    summaryLength:
      c.summaryLength === NodeSummaryLength.Short ||
      c.summaryLength === NodeSummaryLength.Long
        ? c.summaryLength
        : NodeSummaryLength.Medium,
    outputFormat,
    sourceNodeRef:
      typeof c.sourceNodeRef === 'string' ? c.sourceNodeRef : 'text_generation',
  };
}

function resolveSourceOutput(
  sourceNodeRef: string,
  previousOutputs: PreviousOutputs,
): string | undefined {
  switch (sourceNodeRef) {
    case 'text_generation':
      return previousOutputs.text;
    case 'translation':
      return previousOutputs.translatedText;
    case 'transcription':
      return previousOutputs.transcription;
    default:
      return previousOutputs.text;
  }
}

function buildSystemPrompt(
  rule: Rule,
  config: NormalizedSummarizationConfig,
): string {
  return [
    'You are a professional content summarizer.',
    'Summarize the provided content clearly and concisely.',
    'Preserve the core message, key points, and brand voice.',
    'Never add information that is not in the original content.',
    '',
    '=== BRAND CONTEXT ===',
    `Brand name: ${rule.brand.brandName}`,
    `Brand tone: ${rule.brand.brandTone.join(', ')}`,
    `Brand voice: ${rule.brand.brandVoice}`,
    '',
    '=== AUDIENCE ===',
    `Target audience: ${rule.audience.description}`,
    `Language: ${rule.audience.language}`,
    '',
    '=== SUMMARY SETTINGS ===',
    `Length: ${config.summaryLength}`,
    config.summaryLength === NodeSummaryLength.Short
      ? 'Maximum 2-3 sentences. Capture only the single most important point.'
      : config.summaryLength === NodeSummaryLength.Medium
        ? 'Maximum 1 paragraph. Cover the main points without detail.'
        : 'Maximum 3 paragraphs. Cover all key points with some detail.',
    '',
    `Format: ${config.outputFormat}`,
    config.outputFormat === 'paragraph'
      ? 'Write in flowing paragraph form.'
      : config.outputFormat === 'bullets'
        ? 'Write as concise bullet points. Each bullet one key point.'
        : 'Write as a single TL;DR sentence starting with "TL;DR:"',
    '',
    '=== OUTPUT ===',
    'Return only the summary.',
    'No preamble, no explanation, no metadata.',
    'Match the tone and voice of the original brand.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHumanPrompt(sourceOutput: string, userPrompt?: string): string {
  return [
    'Summarize the following content:',
    '',
    sourceOutput,
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
export class SummarizationService {
  constructor(private readonly llm: LlmService) {}

  async summarize(
    input: SummarizationInput,
  ): Promise<{ summary: string }> {
    const { rule, previousOutputs, userPrompt, config } = input;
    const normalized = normalizeSummarizationConfig(config);
    const sourceOutput = resolveSourceOutput(
      normalized.sourceNodeRef,
      previousOutputs,
    )?.trim();
    if (!sourceOutput) {
      throw new UnprocessableEntityException(
        `Summarization source node "${normalized.sourceNodeRef}" has no output. Cannot summarize.`,
      );
    }

    const systemPrompt = buildSystemPrompt(rule, normalized);
    const humanPrompt = buildHumanPrompt(sourceOutput, userPrompt);
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: 0.2,
    });
    const res = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);
    const summary = messageContentToString(res.content).trim();
    return { summary };
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Summarization requires `rule` on NodeExecutionInput',
      );
    }

    const normalized = normalizeSummarizationConfig(input.config ?? {});
    const sourceOutput = resolveSourceOutput(
      normalized.sourceNodeRef,
      input.previousOutputs ?? {},
    )?.trim();
    if (!sourceOutput) {
      throw new UnprocessableEntityException(
        `Summarization source node "${normalized.sourceNodeRef}" has no output. Cannot summarize.`,
      );
    }
    const systemPrompt = buildSystemPrompt(input.rule, normalized);
    const humanPrompt = buildHumanPrompt(sourceOutput, input.userPrompt);
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: 0.2,
    });
    let summary = '';
    if (input.onChunk) {
      const stream = await model.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);
      for await (const chunk of stream) {
        const piece = chunkToString(chunk.content);
        if (piece) {
          input.onChunk(piece);
          summary += piece;
        }
      }
      summary = summary.trim();
    } else {
      const summarized = await this.summarize({
        rule: input.rule,
        contentPrompt: input.contentPrompt ?? '',
        previousOutputs: input.previousOutputs ?? {},
        userPrompt: input.userPrompt,
        config: input.config ?? {},
      });
      summary = summarized.summary;
    }

    return { output: summary };
  }
}
