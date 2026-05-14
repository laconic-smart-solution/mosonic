import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  NodeFormalityLevel,
  NodeOutputFormat,
  NodeSummaryLength,
  NodeTextTone,
  WorkflowNodeType,
} from '../../nodes/schemas/workflow-node.schema';
import {
  parseWorkflowNodeConfig,
  parseWorkflowNodeConfigOrThrow,
} from '../../nodes/workflow-node-config.zod';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  CaptionMappingSource,
  ChannelMediaMapping,
} from '../../rule/schemas/rule.schema';
import { normalizedRuleChannelMapping } from '../../rule/rule-mapping.util';

export type GeneratedWorkflowNode = {
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  config: Record<string, unknown>;
};

function nodeTypeFromString(value: unknown): WorkflowNodeType | null {
  return typeof value === 'string' &&
    (Object.values(WorkflowNodeType) as string[]).includes(value)
    ? (value as WorkflowNodeType)
    : null;
}

function coerceConfigForGeneration(
  type: WorkflowNodeType,
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const parsed = parseWorkflowNodeConfig(type, raw ?? {});
  const data = parsed.ok
    ? parsed.data
    : parseWorkflowNodeConfigOrThrow(type, {});
  return data as unknown as Record<string, unknown>;
}

function inferTextToneFromRule(rule: Rule): NodeTextTone {
  const raw = (rule.brand.brandTone[0] ?? 'friendly').toLowerCase();
  if (raw.includes('profess')) {
    return NodeTextTone.Professional;
  }
  if (raw.includes('formal')) {
    return NodeTextTone.Formal;
  }
  if (raw.includes('wit') || raw.includes('humor')) {
    return NodeTextTone.Witty;
  }
  if (raw.includes('casual')) {
    return NodeTextTone.Casual;
  }
  if (raw.includes('friend')) {
    return NodeTextTone.Friendly;
  }
  return NodeTextTone.Friendly;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

@Injectable()
export class WorkflowGenerationService {
  private readonly logger = new Logger(WorkflowGenerationService.name);

  constructor(private readonly llm: LlmService) {}

  private fallback(rule: Rule, _contentPrompt: string): GeneratedWorkflowNode[] {
    const nodes: GeneratedWorkflowNode[] = [];
    const format = rule.campaign.contentFormats[0] ?? 'caption';
    nodes.push({
      type: WorkflowNodeType.KeywordPlanner,
      order: nodes.length + 1,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.KeywordPlanner, {}),
    });
    nodes.push({
      type: WorkflowNodeType.TextGeneration,
      order: nodes.length + 1,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.TextGeneration, {
        outputFormat: format.toLowerCase().includes('caption')
          ? NodeOutputFormat.Caption
          : NodeOutputFormat.Paragraph,
        tone: inferTextToneFromRule(rule),
        textLength: NodeSummaryLength.Medium,
      }),
    });

    const mappingNeeds = {
      translation: rule.channels.some(
        (c) =>
          normalizedRuleChannelMapping(c).caption ===
          CaptionMappingSource.TranslatedText,
      ),
      summary: rule.channels.some(
        (c) =>
          normalizedRuleChannelMapping(c).caption ===
          CaptionMappingSource.Summary,
      ),
      image: rule.channels.some(
        (c) =>
          normalizedRuleChannelMapping(c).media === ChannelMediaMapping.Image,
      ),
      video: rule.channels.some(
        (c) =>
          normalizedRuleChannelMapping(c).media === ChannelMediaMapping.Video,
      ),
    };

    const mappingDriven = rule.channels.some((c) => c.contentMapping != null);

    const hasVisualChannel = rule.channels.some((c) =>
      ['instagram', 'facebook', 'tiktok', 'youtube'].includes(
        c.channel.toLowerCase(),
      ),
    );
    const targetLanguages = rule.audience.targetLanguages.filter(
      (l) => l && l !== rule.audience.language,
    );

    const needImage = mappingDriven ? mappingNeeds.image : hasVisualChannel;
    const needTranslation = mappingDriven
      ? mappingNeeds.translation
      : targetLanguages.length > 0;
    const needSummary = mappingDriven ? mappingNeeds.summary : false;
    const needVideo = mappingDriven ? mappingNeeds.video : false;

    if (needSummary) {
      nodes.push({
        type: WorkflowNodeType.Summarization,
        order: nodes.length + 1,
        isLocked: false,
        config: coerceConfigForGeneration(WorkflowNodeType.Summarization, {
          summaryLength: NodeSummaryLength.Short,
        }),
      });
    }

    if (needTranslation) {
      nodes.push({
        type: WorkflowNodeType.Translation,
        order: nodes.length + 1,
        isLocked: false,
        config: coerceConfigForGeneration(WorkflowNodeType.Translation, {
          sourceLanguage: rule.audience.language || 'auto',
          targetLanguage: targetLanguages[0] ?? 'th',
          formalityLevel: NodeFormalityLevel.Casual,
        }),
      });
    }

    if (needImage) {
      nodes.push({
        type: WorkflowNodeType.ImageGeneration,
        order: nodes.length + 1,
        isLocked: false,
        config: coerceConfigForGeneration(
          WorkflowNodeType.ImageGeneration,
          {},
        ),
      });
    }

    if (needVideo) {
      nodes.push({
        type: WorkflowNodeType.VideoGeneration,
        order: nodes.length + 1,
        isLocked: false,
        config: coerceConfigForGeneration(
          WorkflowNodeType.VideoGeneration,
          {},
        ),
      });
    }

    return nodes.map((n, idx) => ({ ...n, order: idx + 1 }));
  }

  private normalizeAiOutput(
    aiNodes: unknown,
    rule: Rule,
    contentPrompt: string,
  ): GeneratedWorkflowNode[] {
    if (!Array.isArray(aiNodes)) {
      return this.fallback(rule, contentPrompt);
    }
    const normalized: GeneratedWorkflowNode[] = [];
    for (const item of aiNodes) {
      if (!item || typeof item !== 'object') continue;
      const asObj = item as Record<string, unknown>;
      const type = nodeTypeFromString(asObj.type);
      if (!type) continue;
      normalized.push({
        type,
        order:
          typeof asObj.order === 'number' && asObj.order >= 1
            ? Math.floor(asObj.order)
            : normalized.length + 1,
        isLocked: Boolean(asObj.isLocked ?? false),
        config: coerceConfigForGeneration(
          type,
          (asObj.config as Record<string, unknown> | undefined) ?? {},
        ),
      });
    }

    const textCount = normalized.filter(
      (n) => n.type === WorkflowNodeType.TextGeneration,
    ).length;
    const plannerCount = normalized.filter(
      (n) => n.type === WorkflowNodeType.KeywordPlanner,
    ).length;
    if (textCount !== 1 || plannerCount > 1) {
      return this.fallback(rule, contentPrompt);
    }

    let withPlanner = normalized;
    if (plannerCount === 0) {
      withPlanner = [
        ...normalized,
        {
          type: WorkflowNodeType.KeywordPlanner,
          order: 0,
          isLocked: false,
          config: coerceConfigForGeneration(
            WorkflowNodeType.KeywordPlanner,
            {},
          ),
        },
      ];
    }

    const planner = withPlanner.find(
      (n) => n.type === WorkflowNodeType.KeywordPlanner,
    )!;
    const textNode = withPlanner.find(
      (n) => n.type === WorkflowNodeType.TextGeneration,
    )!;
    const others = withPlanner
      .filter(
        (n) =>
          n.type !== WorkflowNodeType.KeywordPlanner &&
          n.type !== WorkflowNodeType.TextGeneration,
      )
      .sort((a, b) => a.order - b.order);

    const ordered = [planner, textNode, ...others];
    return ordered.map((n, idx) => ({ ...n, order: idx + 1 }));
  }

  async generate(
    rule: Rule,
    contentPrompt: string,
  ): Promise<GeneratedWorkflowNode[]> {
    const mappingContext = rule.channels.map((ch) => {
      const m = normalizedRuleChannelMapping(ch);
      return {
        channel: ch.channel,
        needsCaption: m.caption,
        needsMedia: m.media,
      };
    });

    const nodeSchemas = {
      keyword_planner: {
        type: 'keyword_planner',
        order: 1,
        isLocked: false,
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          temperature: 'number 0-2',
          maxTokens: 'integer >= 1',
        },
      },
      text_generation: {
        type: 'text_generation',
        order: 2,
        isLocked: false,
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          temperature: 'number 0-2',
          maxTokens: 'integer >= 1',
          outputFormat: 'paragraph | bullets | caption',
          tone: 'professional | casual | friendly | formal | witty',
          textLength: 'short | medium | long',
        },
      },
      image_generation: {
        type: 'image_generation',
        order: 2,
        isLocked: false,
        config: {
          provider: 'openai',
          model: 'dall-e-3 | dall-e-2',
          size: 'optional explicit OpenAI size if set',
          quality: 'standard | hd',
          style: 'natural | vivid',
          aspectRatio: '1:1 | 16:9 | 9:16 | 4:5',
          negativePrompt: 'optional string',
        },
      },
      translation: {
        type: 'translation',
        order: 3,
        isLocked: false,
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          sourceLanguage: 'ISO code or auto',
          targetLanguage: 'ISO code',
          formalityLevel: 'formal | casual',
          preserveFormatting: 'boolean',
        },
      },
      video_generation: {
        type: 'video_generation',
        order: 4,
        isLocked: false,
        config: {
          provider: 'openai',
          model: 'sora-2',
          duration: 'integer seconds',
          resolution: '1080p | 720p',
          aspectRatio: '16:9 | 9:16 | 1:1 | 4:5',
        },
      },
      transcription: {
        type: 'transcription',
        order: 5,
        isLocked: false,
        config: {
          provider: 'openai | groq',
          model: 'whisper-1',
          sourceType: 'audio | video',
          language: 'auto | en | th | …',
        },
      },
      summarization: {
        type: 'summarization',
        order: 6,
        isLocked: false,
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          summaryLength: 'short | medium | long',
          outputFormat: 'paragraph | bullets | tldr',
          sourceNodeRef: 'text_generation | translation | transcription',
        },
      },
    };

    const prompt = [
      'You are a workflow planning engine for a content generation platform.',
      'Decide which nodes are needed based on the rule, channel content mappings, and content prompt.',
      'Return a JSON object with a single key "nodes" containing an array of node objects.',
      '',
      '=== CONTENT REQUEST ===',
      `The user wants to create: "${contentPrompt}"`,
      '',
      '=== STRUCTURED CONFIG (required) ===',
      'Each node MUST include a "config" object matching its type in NODE SCHEMAS below.',
      'Use only allowed enum strings for each field. Do not invent keys.',
      'Do NOT include userPrompt or any per-node free-text prompt fields — workflows store only reusable "how" (config); the run brief is supplied separately when executing a pipeline.',
      '',
      '=== CHANNEL CONTENT MAPPINGS ===',
      JSON.stringify(mappingContext),
      '',
      '=== NODE DECISION RULES ===',
      '- Exactly one keyword_planner and exactly one text_generation are REQUIRED',
      '- keyword_planner MUST have a lower order number than text_generation (planner runs first)',
      '- Include translation if ANY channel mapping needsCaption is "translatedText"',
      '- Include summarization if ANY mapping needsCaption is "summary"',
      '- Include image_generation if ANY mapping needsMedia is "image"',
      '- Include video_generation if ANY mapping needsMedia is "video"',
      '- If mappings are missing on a legacy rule, infer from channels and targetLanguages',
      '- Include transcription only if audio/video input is implied in the prompt',
      '- Order must be sequential starting from 1 with no gaps after normalization',
      '- Preferred order after writer: summarization → translation → image_generation → video_generation → transcription',
      '',
      '=== NODE SCHEMAS ===',
      JSON.stringify(nodeSchemas, null, 2),
      '',
      `Rule: ${JSON.stringify(rule)}`,
    ].join('\n');

    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // getChatModel already has temperature: 0.3 and json_object mode
        const model = this.llm.getChatModel();

        const res = await model.invoke([
          [
            'system',
            'You are a workflow planning engine. Return strict JSON only. No markdown, no code fences.',
          ],
          ['human', prompt],
        ]);

        const text =
          typeof res.content === 'string'
            ? res.content
            : JSON.stringify(res.content ?? null);

        const parsed = safeJsonParse(text);

        const nodes = Array.isArray(parsed)
          ? parsed
          : ((parsed as { nodes: GeneratedWorkflowNode[] })?.nodes ?? []);

        if (!nodes.length) {
          throw new Error('AI returned empty nodes array');
        }

        const normalized = this.normalizeAiOutput(nodes, rule, contentPrompt);

        if (!normalized.length) {
          throw new Error('normalizeAiOutput returned empty result');
        }

        return normalized;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Workflow generation attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`,
        );

        if (attempt === MAX_ATTEMPTS) {
          this.logger.warn('Using fallback workflow');
          return this.fallback(rule, contentPrompt);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return this.fallback(rule, contentPrompt);
  }
}
