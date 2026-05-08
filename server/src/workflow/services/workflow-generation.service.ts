import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  LlmProvider,
  NodeFormalityLevel,
  NodeImageQuality,
  NodeImageStyle,
  NodeOutputFormat,
  NodeSummaryLength,
  type WorkflowNodeConfig,
  WorkflowNodeType,
} from '../../nodes/schemas/workflow-node.schema';
import type { Rule } from '../../rule/schemas/rule.schema';

export type GeneratedWorkflowNode = {
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt?: string;
  config: Record<string, unknown>;
};

function nodeTypeFromString(value: unknown): WorkflowNodeType | null {
  return typeof value === 'string' &&
    (Object.values(WorkflowNodeType) as string[]).includes(value)
    ? (value as WorkflowNodeType)
    : null;
}

function normalizeNodeConfig(
  type: WorkflowNodeType,
  config: Record<string, unknown> | undefined,
): WorkflowNodeConfig {
  const c = config ?? {};
  const asString = (value: unknown, fallback: string): string =>
    typeof value === 'string' ? value : fallback;
  const provider =
    typeof c.provider === 'string' &&
    (Object.values(LlmProvider) as string[]).includes(c.provider)
      ? (c.provider as LlmProvider)
      : undefined;
  switch (type) {
    case WorkflowNodeType.TextGeneration:
      return {
        provider,
        model: asString(c.model, 'gpt-4o'),
        temperature: typeof c.temperature === 'number' ? c.temperature : 0.7,
        maxTokens: typeof c.maxTokens === 'number' ? c.maxTokens : 500,
        outputFormat:
          c.outputFormat === NodeOutputFormat.Bullets ||
          c.outputFormat === NodeOutputFormat.Caption
            ? c.outputFormat
            : NodeOutputFormat.Paragraph,
      };
    case WorkflowNodeType.ImageGeneration:
      return {
        provider,
        model: asString(c.model, 'dall-e-3'),
        size: asString(c.size, '1024x1024'),
        quality:
          c.quality === NodeImageQuality.Hd
            ? NodeImageQuality.Hd
            : NodeImageQuality.Standard,
        style:
          c.style === NodeImageStyle.Vivid
            ? NodeImageStyle.Vivid
            : NodeImageStyle.Natural,
      };
    case WorkflowNodeType.Translation:
      return {
        provider,
        model: asString(c.model, 'gpt-4o'),
        sourceLanguage: asString(c.sourceLanguage, 'en'),
        targetLanguage: asString(c.targetLanguage, 'th'),
        formalityLevel:
          c.formalityLevel === NodeFormalityLevel.Formal
            ? NodeFormalityLevel.Formal
            : NodeFormalityLevel.Casual,
      };
    case WorkflowNodeType.Summarization:
      return {
        provider,
        model: asString(c.model, 'gpt-4o'),
        summaryLength:
          c.summaryLength === NodeSummaryLength.Short ||
          c.summaryLength === NodeSummaryLength.Long
            ? c.summaryLength
            : NodeSummaryLength.Medium,
      };
    case WorkflowNodeType.VideoGeneration:
      return {
        provider,
        model: asString(c.model, 'sora-2'),
      };
    default:
      return {
        provider,
        model: asString(c.model, 'gpt-4o'),
      };
  }
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
  constructor(private readonly llm: LlmService) {}

  private fallback(rule: Rule, contentPrompt: string): GeneratedWorkflowNode[] {
    const nodes: GeneratedWorkflowNode[] = [];
    const primaryTone = rule.brand.brandTone[0] ?? 'friendly';
    const format = rule.campaign.contentFormats[0] ?? 'caption';
    nodes.push({
      type: WorkflowNodeType.TextGeneration,
      order: 1,
      isLocked: true,
      userPrompt: `Write a ${primaryTone} ${format} for: ${contentPrompt}`,
      config: normalizeNodeConfig(WorkflowNodeType.TextGeneration, {
        outputFormat: format.toLowerCase().includes('caption')
          ? NodeOutputFormat.Caption
          : NodeOutputFormat.Paragraph,
      }) as unknown as Record<string, unknown>,
    });

    const hasVisualChannel = rule.channels.some((c) =>
      ['instagram', 'facebook', 'tiktok', 'youtube'].includes(
        c.channel.toLowerCase(),
      ),
    );
    if (hasVisualChannel) {
      nodes.push({
        type: WorkflowNodeType.ImageGeneration,
        order: nodes.length + 1,
        isLocked: false,
        userPrompt: `Generate a visual concept for: ${contentPrompt}`,
        config: normalizeNodeConfig(
          WorkflowNodeType.ImageGeneration,
          undefined,
        ) as unknown as Record<string, unknown>,
      });
    }

    const targetLanguages = rule.audience.targetLanguages.filter(
      (l) => l && l !== rule.audience.language,
    );
    if (targetLanguages.length > 0) {
      nodes.push({
        type: WorkflowNodeType.Translation,
        order: nodes.length + 1,
        isLocked: false,
        userPrompt: `Translate the generated copy to ${targetLanguages[0]} and keep tone consistent.`,
        config: normalizeNodeConfig(WorkflowNodeType.Translation, {
          sourceLanguage: rule.audience.language || 'en',
          targetLanguage: targetLanguages[0],
        }) as unknown as Record<string, unknown>,
      });
    }

    return nodes;
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
        isLocked:
          type === WorkflowNodeType.TextGeneration
            ? true
            : Boolean(asObj.isLocked ?? false),
        userPrompt:
          typeof asObj.userPrompt === 'string' ? asObj.userPrompt : undefined,
        config: normalizeNodeConfig(
          type,
          (asObj.config as Record<string, unknown> | undefined) ?? {},
        ) as unknown as Record<string, unknown>,
      });
    }

    const hasText = normalized.some(
      (n) => n.type === WorkflowNodeType.TextGeneration,
    );
    if (!hasText) {
      return this.fallback(rule, contentPrompt);
    }

    const textNode =
      normalized.find((n) => n.type === WorkflowNodeType.TextGeneration) ??
      this.fallback(rule, contentPrompt)[0];
    const rest = normalized.filter(
      (n) => n.type !== WorkflowNodeType.TextGeneration,
    );

    const result = [{ ...textNode, isLocked: true, order: 1 }, ...rest].map(
      (n, idx) => ({ ...n, order: idx + 1 }),
    );
    return result;
  }

  async generate(
    rule: Rule,
    contentPrompt: string,
  ): Promise<GeneratedWorkflowNode[]> {
    const model = this.llm.getChatModel();

    const nodeSchemas = {
      text_generation: {
        type: 'text_generation',
        order: 1,
        isLocked: true,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 500,
          outputFormat: 'paragraph | bullets | caption',
        },
      },
      image_generation: {
        type: 'image_generation',
        order: 2,
        isLocked: false,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai',
          model: 'dall-e-3',
          size: '1024x1024 | 1792x1024 | 1024x1792',
          quality: 'standard | hd',
          style: 'natural | vivid',
        },
      },
      translation: {
        type: 'translation',
        order: 3,
        isLocked: false,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          sourceLanguage: 'en',
          targetLanguage: 'th',
          formalityLevel: 'formal | casual',
        },
      },
      video_generation: {
        type: 'video_generation',
        order: 4,
        isLocked: false,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai',
          model: 'sora-2',
          duration: 15,
          resolution: '1080p | 720p',
          aspectRatio: '16:9 | 9:16 | 1:1',
        },
      },
      transcription: {
        type: 'transcription',
        order: 5,
        isLocked: false,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai | groq',
          model: 'whisper-1',
          sourceType: 'audio | video',
          language: 'auto | en | th',
        },
      },
      summarization: {
        type: 'summarization',
        order: 6,
        isLocked: false,
        userPrompt: 'string — specific instruction for this node',
        config: {
          provider: 'openai | anthropic | google | groq | ollama',
          model: 'gpt-4o',
          summaryLength: 'short | medium | long',
          outputFormat: 'paragraph | bullets | tldr',
          sourceNodeRef: 'nodeId of the node to summarize',
        },
      },
    };

    const prompt = [
      'You are a workflow planning engine for a content generation platform.',
      'Decide which nodes are needed based on the rule and content prompt.',
      'Return a JSON object with a single key "nodes" containing an array of node objects.',
      '',
      'Rules:',
      '- First node MUST be text_generation, order=1, isLocked=true',
      '- Include image_generation if rule channels are visual (instagram, facebook)',
      '- Include translation if rule targetLanguages has more than one language',
      '- Include video_generation only if rule channels support video',
      '- Include summarization only if content is long form',
      '- Include transcription only if audio/video input is implied',
      '- Order must be sequential starting from 1 with no gaps',
      '- userPrompt must be specific to the rule context and content prompt',
      '',
      'Use exactly these node schemas:',
      JSON.stringify(nodeSchemas, null, 2),
      '',
      `Rule: ${JSON.stringify(rule)}`,
      `Content Prompt: ${contentPrompt}`,
    ].join('\n');

    const res = await model.invoke([
      [
        'system',
        'You are a workflow planning engine. Return strict JSON only.',
      ],
      ['human', prompt],
    ]);

    const text =
      typeof res.content === 'string'
        ? res.content
        : JSON.stringify(res.content ?? null);

    const parsed = safeJsonParse(text);

    // JSON mode wraps in { nodes: [...] } because json_object mode
    // requires a top level object not an array
    const nodes = Array.isArray(parsed)
      ? parsed
      : ((parsed as { nodes: GeneratedWorkflowNode[] })?.nodes ?? []);

    return this.normalizeAiOutput(nodes, rule, contentPrompt);
  }
}
