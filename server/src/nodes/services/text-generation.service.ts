import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeOutputFormat,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  TextGenerationInput,
} from '../types/node-execution.types';

type NormalizedTextConfig = {
  provider?: LlmProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  outputFormat: NodeOutputFormat;
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
  };
}

function buildSystemPrompt(rule: Rule, config: NormalizedTextConfig): string {
  return [
    'You are a professional content writer.',
    'Write content strictly following the brand guidelines below.',
    'Never break character or deviate from the brand tone.',
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
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHumanPrompt(contentPrompt: string, userPrompt?: string): string {
  return [
    `Content request: ${contentPrompt}`,
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
export class TextGenerationService {
  constructor(private readonly llm: LlmService) {}

  /**
   * Brand-grounded copy generation. Use from tests or when you already have
   * `rule` + `contentPrompt` without wrapping in {@link NodeExecutionInput}.
   */
  async generateText(input: TextGenerationInput): Promise<{ text: string }> {
    const { rule, contentPrompt, userPrompt, config } = input;
    const normalized = normalizeTextGenerationConfig(config);
    const systemPrompt = buildSystemPrompt(rule, normalized);
    const humanPrompt = buildHumanPrompt(contentPrompt, userPrompt);

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

    const text = messageContentToString(res.content).trim();
    return { text };
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
    const systemPrompt = buildSystemPrompt(input.rule, normalized);
    const humanPrompt = buildHumanPrompt(contentPrompt, input.userPrompt);
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: normalized.temperature,
      maxTokens: normalized.maxTokens,
    });
    let text = '';
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
      }
      text = text.trim();
    } else {
      const generated = await this.generateText({
        rule: input.rule,
        contentPrompt,
        userPrompt: input.userPrompt,
        config: input.config ?? {},
      });
      text = generated.text;
    }
    return { output: text };
  }
}
