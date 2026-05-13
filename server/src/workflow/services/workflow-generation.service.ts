import { Injectable, Logger } from '@nestjs/common';
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
import {
  CaptionMappingSource,
  ChannelMediaMapping,
} from '../../rule/schemas/rule.schema';
import { normalizedRuleChannelMapping } from '../../rule/rule-mapping.util';

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
  private readonly logger = new Logger(WorkflowGenerationService.name);

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
        userPrompt: `Summarize the generated copy for professional / short-form channels: ${contentPrompt}`,
        config: normalizeNodeConfig(WorkflowNodeType.Summarization, {
          summaryLength: NodeSummaryLength.Short,
        }) as unknown as Record<string, unknown>,
      });
    }

    if (needTranslation) {
      nodes.push({
        type: WorkflowNodeType.Translation,
        order: nodes.length + 1,
        isLocked: false,
        userPrompt: `Translate the generated copy to ${targetLanguages[0] ?? 'the target audience language'} and keep tone consistent.`,
        config: normalizeNodeConfig(WorkflowNodeType.Translation, {
          sourceLanguage: rule.audience.language || 'en',
          targetLanguage: targetLanguages[0] ?? 'th',
        }) as unknown as Record<string, unknown>,
      });
    }

    if (needImage) {
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

    if (needVideo) {
      nodes.push({
        type: WorkflowNodeType.VideoGeneration,
        order: nodes.length + 1,
        isLocked: false,
        userPrompt: `Generate a short video concept aligned with the campaign: ${contentPrompt}`,
        config: normalizeNodeConfig(
          WorkflowNodeType.VideoGeneration,
          undefined,
        ) as unknown as Record<string, unknown>,
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
    const mappingContext = rule.channels.map((ch) => {
      const m = normalizedRuleChannelMapping(ch);
      return {
        channel: ch.channel,
        needsCaption: m.caption,
        needsMedia: m.media,
      };
    });

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
      'Decide which nodes are needed based on the rule, channel content mappings, and content prompt.',
      'Return a JSON object with a single key "nodes" containing an array of node objects.',
      '',
      '=== CONTENT REQUEST ===',
      `The user wants to create: "${contentPrompt}"`,
      '',
      '=== CRITICAL RULES FOR userPrompt ===',
      'Every node userPrompt MUST:',
      `  → directly serve this specific content request: "${contentPrompt}"`,
      '  → be a clear actionable instruction for that node type',
      '  → reference what the user actually wants to create',
      '  → NEVER be a generic template',
      '  → NEVER copy brand tone labels or content format labels verbatim',
      '  → NEVER follow pattern "Write a [tone] [format] for: [prompt]"',
      '',
      // `Good userPrompt examples for "${contentPrompt}":`,
      // '  text_generation:',
      // `    "Write a persuasive social media post for: ${contentPrompt}. Make it engaging and action-oriented."`,
      // '  image_generation:',
      // `    "Generate a compelling visual that represents: ${contentPrompt}"`,
      // '  translation:',
      // `    "Translate the content about ${contentPrompt} to target language. Keep tone natural and engaging."`,
      '',
      '=== CHANNEL CONTENT MAPPINGS ===',
      JSON.stringify(mappingContext),
      '',
      '=== NODE DECISION RULES ===',
      '- First node MUST be text_generation, order=1, isLocked=true',
      '- Include translation if ANY channel mapping needsCaption is "translatedText"',
      '- Include summarization if ANY mapping needsCaption is "summary"',
      '- Include image_generation if ANY mapping needsMedia is "image"',
      '- Include video_generation if ANY mapping needsMedia is "video"',
      '- If mappings are missing on a legacy rule, infer from channels and targetLanguages',
      '- Include transcription only if audio/video input is implied in the prompt',
      '- Order must be sequential starting from 1 with no gaps',
      '- Preferred order: text_generation → summarization → translation → image_generation → video_generation → transcription',
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
