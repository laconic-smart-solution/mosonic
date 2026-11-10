import { TemplateClassifierService } from '../../pipeline/intake/template-classifier.service';
import { OutputValidationService } from './output-validation.service';
import { buildDynamicZodSchema } from './dynamic-zod-schema.builder';
import { compileSectionsToMarkdown } from '../../content/content-markdown-compiler.util';
import type { ContentSectionItem } from '../../content/schemas/structured-content.schema';
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


export function detectExplicitUserFormatting(contentPrompt?: string): boolean {
  if (!contentPrompt || typeof contentPrompt !== 'string') return false;
  const p = contentPrompt.trim();
  if (p.length === 0) return false;

  // Numbered or lettered lists like "1. ", "1) ", "A. "
  if (/(?:^|\n)\s*(?:\d+[\.\)]|[a-zA-Z][\.\)])\s+/m.test(p)) return true;

  // Markdown headers like "# ", "## ", "### "
  if (/(?:^|\n)\s*#{1,6}\s+/m.test(p)) return true;

  // Bullet indicators like "- ", "* ", "• ", "✨", "👉", "🔥", "✅", "🛒", "📢", "🏎️"
  if (/(?:^|\n)\s*(?:[-*•✨👉🔥✅🛒📢🏎️])\s+/m.test(p)) return true;

  // Section placeholder patterns like "[Headline]", "[Key features]", "[CTA]"
  if (/\[[^\]]{3,40}\]/i.test(p)) return true;

  // Structural cue keywords
  if (/\b(?:template|format|structure|sections?|layout|outline)\s*[:=]/i.test(p)) return true;
  if (/\b(?:use this (?:format|template|structure)|following structure|structured as)\b/i.test(p)) return true;

  return false;
}

function buildSystemPrompt(
  rule: Rule,
  config: NormalizedTextConfig,
  previousOutputs?: PreviousOutputs,
  hasExplicitUserFormat = false,
): string {
  const intelligenceBrief =
    previousOutputs?.intelligenceBrief?.trim() ||
    previousOutputs?.intelligenceHints?.trim() ||
    null;

  return [
    'You are a professional content writer.',
    'Write content strictly following the brand guidelines below.',
    'Never break character or deviate from the brand tone.',
    'This copy will be published directly to social media on behalf of the brand.',
    'CRITICAL: NEVER write in the voice of a conversational AI assistant (e.g. "I can help research this...", "As an AI...", "I could not find/verify...", "If you mean...", "Let me know if you would like me to...").',
    'If the request mentions an unverified, fictional, or ambiguous entity or historical figure, do NOT produce an apology letter, disclaimer card, or meta clarification. Instead, weave the verified cultural, historical, or brand context into an inspiring, celebratory, or creative storytelling post.',
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
    `Keywords (pick at most 2-3 that fit; use them naturally, never as a list): ${rule.campaign.keywords.join(', ')}`,
    `Hashtags: ${rule.campaign.hashtagStrategy.join(', ')}`,
    '',
    '=== CONTENT GUIDELINES ===',
    `Do: ${rule.contentGuidelines.dos.join(', ')}`,
    `Do not: ${rule.contentGuidelines.donts.join(', ')}`,
    `Always include: ${rule.contentGuidelines.requiredElements.join(', ')}`,
    `SEO keywords (at most 2-3 in the copy, woven into sentences, never listed): ${rule.contentGuidelines.seoGuidelines.primaryKeywords.join(', ')}`,
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
    ...(hasExplicitUserFormat
      ? [
          '=== OUTPUT FORMAT & USER LAYOUT CONTRACT ===',
          'The user has provided an explicit layout, template, or multi-section formatting structure in their request.',
          'You MUST follow the user-provided structure, section headers, bullet points, numbered lists, emojis, and layout PRECISELY.',
          'Do NOT collapse or summarize this content into a single narrative paragraph.',
          'Preserve all requested sections, bullet lists, bold headings, and emojis in the exact order requested.',
          `Maximum length: ${Math.max(config.maxTokens, 1200)} tokens.`,
          'Do not include any explanation, preamble, or metadata.',
          'Return only the content itself.',
        ]
      : [
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
        ]),
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
  sourcePackNotes?: string,
): string {
  const kw = previousOutputs?.keywords?.trim();
  const notes = sourcePackNotes?.trim();
  return [
    `Content request: ${contentPrompt}`,
    kw
      ? `Target keywords from the keyword planner (use at most 2-3 of them, naturally in sentences; never list them or chain them with commas; readability first):\n${kw}`
      : '',
    notes
      ? `Source attachments for this run (use as factual product/context — do not invent beyond this):\n${notes}`
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

  constructor(
    private readonly llm: LlmService,
    private readonly classifier: TemplateClassifierService = new TemplateClassifierService(),
    private readonly outputValidator: OutputValidationService = new OutputValidationService(),
  ) {}

  /**
   * Brand-grounded copy generation. Use from tests or when you already have
   * `rule` + `contentPrompt` without wrapping in {@link NodeExecutionInput}.
   */
  async generateText(input: TextGenerationInput): Promise<{
    text: string;
    sections?: ContentSectionItem[];
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const { rule, contentPrompt, config, previousOutputs, sourcePackNotes } =
      input;
    const normalized = normalizeTextGenerationConfig(config);
    const hasExplicitUserFormat = detectExplicitUserFormatting(contentPrompt);
    if (hasExplicitUserFormat && normalized.maxTokens < 1200) {
      normalized.maxTokens = 1200;
    }
    const systemPrompt = buildSystemPrompt(rule, normalized, previousOutputs, hasExplicitUserFormat);
    const humanPrompt = buildHumanPrompt(
      contentPrompt,
      previousOutputs,
      sourcePackNotes,
    );

    // If explicit formatting or structured template requested, try structured engine
    if (hasExplicitUserFormat) {
      const contract = this.classifier.classifyPrompt(contentPrompt);
      if (contract.isStructured && contract.sections.length > 0) {
        try {
          const schema = buildDynamicZodSchema(contract.sections);
          const structuredModel = this.llm.getChatModelForStructuredOutput<Record<string, unknown>>(
            schema,
            {
              provider: normalized.provider,
              model: normalized.model,
              temperature: normalized.temperature,
              maxTokens: normalized.maxTokens,
            },
          );

          const structuredRes = (await structuredModel.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(humanPrompt),
          ])) as Record<string, unknown>;

          let sections: ContentSectionItem[] = contract.sections.map((secDef) => {
            const rawVal = structuredRes?.[secDef.key];
            if (secDef.kind === 'bullet_list' || secDef.kind === 'numbered_list') {
              const items = Array.isArray(rawVal) ? rawVal.map(String) : rawVal ? [String(rawVal)] : [];
              return {
                key: secDef.key,
                title: secDef.title,
                kind: secDef.kind,
                items,
                content: items.map((i) => `• ${i}`).join('\n'),
              };
            }
            if (secDef.kind === 'hashtags') {
              const items = Array.isArray(rawVal) ? rawVal.map(String) : typeof rawVal === 'string' ? rawVal.split(/\s+/).filter(Boolean) : [];
              return {
                key: secDef.key,
                title: secDef.title,
                kind: secDef.kind,
                items,
                content: items.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' '),
              };
            }
            return {
              key: secDef.key,
              title: secDef.title,
              kind: secDef.kind,
              content: rawVal != null ? String(rawVal) : '',
            };
          });

          // Validate output deterministically
          const valResult = this.outputValidator.validateSections(sections, contract);
          if (!valResult.valid) {
            this.logger.warn(`Initial structured output validation failed: ${valResult.issues.map(i => i.message).join('; ')}. Attempting 1 repair turn.`);
            try {
              const repairPrompt = this.outputValidator.buildRepairPrompt(valResult, contract);
              const repairRes = (await structuredModel.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`${humanPrompt}\n\n${repairPrompt}`),
              ])) as Record<string, unknown>;

              sections = contract.sections.map((secDef) => {
                const rawVal = repairRes?.[secDef.key] !== undefined ? repairRes[secDef.key] : structuredRes?.[secDef.key];
                if (secDef.kind === 'bullet_list' || secDef.kind === 'numbered_list') {
                  const items = Array.isArray(rawVal) ? rawVal.map(String) : rawVal ? [String(rawVal)] : [];
                  return {
                    key: secDef.key,
                    title: secDef.title,
                    kind: secDef.kind,
                    items,
                    content: items.map((i) => `• ${i}`).join('\n'),
                  };
                }
                if (secDef.kind === 'hashtags') {
                  const items = Array.isArray(rawVal) ? rawVal.map(String) : typeof rawVal === 'string' ? rawVal.split(/\s+/).filter(Boolean) : [];
                  return {
                    key: secDef.key,
                    title: secDef.title,
                    kind: secDef.kind,
                    items,
                    content: items.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' '),
                  };
                }
                return {
                  key: secDef.key,
                  title: secDef.title,
                  kind: secDef.kind,
                  content: rawVal != null ? String(rawVal) : '',
                };
              });
            } catch (repairErr) {
              this.logger.warn(`Structured repair turn failed: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`);
            }
          }

          const compiledText = compileSectionsToMarkdown(sections);
          return {
            text: compiledText,
            sections,
          };
        } catch (structuredErr) {
          this.logger.warn(`Structured output generation failed, falling back to plain text: ${structuredErr instanceof Error ? structuredErr.message : String(structuredErr)}`);
        }
      }
    }

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
    const hasExplicitUserFormat = detectExplicitUserFormatting(contentPrompt);
    if (hasExplicitUserFormat && normalized.maxTokens < 1200) {
      normalized.maxTokens = 1200;
    }
    const systemPrompt = buildSystemPrompt(
      input.rule,
      normalized,
      input.previousOutputs,
      hasExplicitUserFormat,
    );
    const humanPrompt = buildHumanPrompt(
      contentPrompt,
      input.previousOutputs,
      input.sourcePack?.notes,
    );
    const model = this.llm.getChatModelForPlainText({
      provider: normalized.provider,
      model: normalized.model,
      temperature: normalized.temperature,
      maxTokens: normalized.maxTokens,
    });
    let text = '';
    let sections: ContentSectionItem[] | undefined;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    if (input.onChunk && !hasExplicitUserFormat) {
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
        sourcePackNotes: input.sourcePack?.notes,
      });
      text = generated.text;
      sections = generated.sections;
      usage = generated.usage;
      if (input.onChunk && text) {
        input.onChunk(text);
      }
    }
    return {
      output: text,
      ...(sections ? { sections } : {}),
      ...(usage ? { usage } : {}),
    };
  }
}
