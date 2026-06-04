import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import { extractUsageFromAiMessage } from '../langchain-usage.util';
import type { NodeExecutionInput, NodeExecutionResult } from '../types/node-execution.types';

type NormalizedKeywordPlannerConfig = {
  provider?: LlmProvider;
  model: string;
  temperature: number;
};

function normalizeKeywordPlannerConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedKeywordPlannerConfig {
  const c = config ?? {};
  return {
    provider:
      c.provider && Object.values(LlmProvider).includes(c.provider)
        ? c.provider
        : undefined,
    model: typeof c.model === 'string' ? c.model : 'gpt-4o',
    temperature: typeof c.temperature === 'number' ? c.temperature : 0.3,
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
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

/** Flatten model JSON or plain text into a single newline-separated keyword block. */
function normalizeKeywordsPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  const parsed = safeJsonParse(trimmed);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const kw = (parsed as { keywords?: unknown }).keywords;
    if (Array.isArray(kw)) {
      return kw
        .map((k) => (typeof k === 'string' ? k.trim() : String(k)))
        .filter(Boolean)
        .join('\n');
    }
    if (typeof kw === 'string' && kw.trim()) {
      return kw.trim();
    }
  }
  return trimmed;
}

@Injectable()
export class KeywordPlannerService {
  constructor(private readonly llm: LlmService) {}

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Keyword planner requires `rule` on NodeExecutionInput',
      );
    }
    const contentPrompt = input.contentPrompt ?? '';
    const normalized = normalizeKeywordPlannerConfig(input.config ?? {});
    const systemPrompt = [
      'You are an SEO keyword planner.',
      'Given the campaign brief and brand context, propose a concise list of target search keywords and key phrases.',
      'Prefer specific, intent-rich phrases over single generic words where appropriate.',
      'Return strict JSON only with this shape: {"keywords":["phrase one","phrase two",...]}',
      'No markdown, no code fences, no explanation outside the JSON.',
    ].join('\n');

    const humanParts = [
      `Content / campaign brief:\n${contentPrompt}`,
      `Brand: ${input.rule.brand.brandName} (${input.rule.brand.industry})`,
      `Audience language: ${input.rule.audience.language}`,
      `Campaign seed keywords: ${input.rule.campaign.keywords.join(', ')}`,
      `SEO primary keywords from guidelines: ${input.rule.contentGuidelines.seoGuidelines.primaryKeywords.join(', ')}`,
    ].filter(Boolean);

    const model = this.llm.getChatModel({
      provider: normalized.provider,
      model: normalized.model,
    });

    const res = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanParts.join('\n\n')),
    ]);

    const text = messageContentToString(res.content);
    const keywords = normalizeKeywordsPayload(text);
    if (!keywords) {
      throw new UnprocessableEntityException(
        'Keyword planner returned no keywords; adjust the brief or retry.',
      );
    }

    const usage = extractUsageFromAiMessage(res);
    return usage ? { output: keywords, usage } : { output: keywords };
  }
}
