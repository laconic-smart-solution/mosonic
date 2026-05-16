import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  NodeAspectRatio,
  NodeFormalityLevel,
  NodeImageQuality,
  NodeMediaSourceType,
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

const WORKFLOW_PLAN_TEMPERATURE = 0.55;

/** Exported for tests — deterministic plan when the LLM fails or returns invalid JSON. */
export function generateFallbackWorkflowNodes(
  rule: Rule,
  contentPrompt: string,
): GeneratedWorkflowNode[] {
  return buildFallbackNodes(rule, contentPrompt);
}

function coerceConfigForGeneration(
  type: WorkflowNodeType,
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = parseWorkflowNodeConfig(type, {});
  if (!base.ok) {
    return parseWorkflowNodeConfigOrThrow(type, {}) as unknown as Record<
      string,
      unknown
    >;
  }
  let acc: Record<string, unknown> = { ...(base.data as object) } as Record<
    string,
    unknown
  >;
  const incoming =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    const trial = { ...acc, [k]: v };
    const r = parseWorkflowNodeConfig(type, trial);
    if (r.ok) {
      acc = { ...(r.data as object) } as Record<string, unknown>;
    }
  }
  const final = parseWorkflowNodeConfig(type, acc);
  if (final.ok) {
    return final.data as unknown as Record<string, unknown>;
  }
  return base.data as unknown as Record<string, unknown>;
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

export type ContentPromptHints = {
  wantsVideo: boolean;
  wantsCarousel: boolean;
  wantsTranscription: boolean;
  wantsSummary: boolean;
  prefersCaption: boolean;
  longForm: boolean;
  mentionsTranslate: boolean;
};

export function inferContentPromptHints(contentPrompt: string): ContentPromptHints {
  const p = contentPrompt.trim();
  const pl = p.toLowerCase();
  return {
    wantsVideo:
      /\b(video|reel|reels|tiktok|shorts?|story\s*clip|motion|animated\s+ad)\b/i.test(
        p,
      ),
    wantsCarousel:
      /\b(carousel|multiple\s+images|multi[- ]image|photo\s+series|slideshow)\b/i.test(
        p,
      ),
    wantsTranscription:
      /\b(podcast|transcrib|audio\s+clip|voice\s+note|interview\s+recording)\b/i.test(
        p,
      ),
    wantsSummary:
      /\b(summary|tl;dr|tldr|executive\s+summary|digest)\b/i.test(pl),
    prefersCaption:
      /\b(caption|instagram\s+post|ig\s+post|tweet|x\s+post)\b/i.test(pl) ||
      pl.length < 140,
    longForm:
      pl.length > 320 ||
      /\b(blog|article|newsletter|long[- ]form|white\s*paper)\b/.test(pl),
    mentionsTranslate:
      /\b(translat|localized|locali[sz]e|thai\s+version|japanese\s+version)\b/i.test(
        pl,
      ),
  };
}

export function buildRuleSummary(rule: Rule): Record<string, unknown> {
  return {
    ruleId: rule.ruleId,
    name: rule.name,
    brand: {
      brandName: rule.brand.brandName,
      industry: rule.brand.industry,
      brandTone: rule.brand.brandTone,
    },
    audience: {
      description: rule.audience.description,
      language: rule.audience.language,
      targetLanguages: rule.audience.targetLanguages,
      location: rule.audience.location?.slice(0, 5),
    },
    campaign: {
      goals: rule.campaign.goals,
      contentFormats: rule.campaign.contentFormats,
    },
    channels: rule.channels.map((c) => {
      const m = normalizedRuleChannelMapping(c);
      return {
        channel: c.channel,
        captionMapping: m.caption,
        mediaMapping: m.media,
        hasExplicitMapping: c.contentMapping != null,
      };
    }),
    contentGuidelines: {
      donts: rule.contentGuidelines.donts.slice(0, 8),
      requiredElements: rule.contentGuidelines.requiredElements.slice(0, 8),
    },
  };
}

function inferVisualAspectFromPromptAndRule(
  contentPrompt: string,
  rule: Rule,
  hints: ContentPromptHints,
): NodeAspectRatio {
  const pl = contentPrompt.toLowerCase();
  if (
    /\b(reel|stories|story|tiktok|vertical|9:16|portrait)\b/.test(pl) ||
    (hints.wantsVideo &&
      !/\b(youtube|linkedin|widescreen|16:9|landscape)\b/.test(pl))
  ) {
    if (
      rule.channels.some((c) =>
        ['instagram', 'tiktok'].includes(c.channel.toLowerCase()),
      ) ||
      /\b(reel|tiktok|story)\b/.test(pl)
    ) {
      return NodeAspectRatio.R9x16;
    }
  }
  if (
    rule.channels.some((c) =>
      ['youtube', 'linkedin'].includes(c.channel.toLowerCase()),
    ) &&
    !/\b(instagram|tiktok|reel)\b/.test(pl)
  ) {
    return NodeAspectRatio.R16x9;
  }
  if (
    rule.channels.some((c) =>
      ['instagram', 'tiktok'].includes(c.channel.toLowerCase()),
    )
  ) {
    return NodeAspectRatio.R9x16;
  }
  return NodeAspectRatio.R1x1;
}

function textOutputFormatFrom(
  rule: Rule,
  hints: ContentPromptHints,
): NodeOutputFormat {
  const format = rule.campaign.contentFormats[0] ?? 'caption';
  if (hints.longForm) {
    return NodeOutputFormat.Paragraph;
  }
  if (
    hints.prefersCaption ||
    format.toLowerCase().includes('caption') ||
    /\bcaption\b/i.test(rule.campaign.contentFormats.join(' '))
  ) {
    return NodeOutputFormat.Caption;
  }
  if (format.toLowerCase().includes('bullet')) {
    return NodeOutputFormat.Bullets;
  }
  return NodeOutputFormat.Paragraph;
}

function buildFallbackNodes(
  rule: Rule,
  contentPrompt: string,
): GeneratedWorkflowNode[] {
  const hints = inferContentPromptHints(contentPrompt);
  const nodes: GeneratedWorkflowNode[] = [];
  const format = textOutputFormatFrom(rule, hints);

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
      outputFormat: format,
      tone: inferTextToneFromRule(rule),
      textLength: hints.longForm
        ? NodeSummaryLength.Long
        : NodeSummaryLength.Medium,
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

  let needImage = mappingDriven
    ? mappingNeeds.image
    : hasVisualChannel &&
      (!hints.wantsVideo || hints.wantsCarousel);
  if (!mappingDriven && hints.wantsCarousel) {
    needImage = true;
  }

  let needVideo = mappingDriven ? mappingNeeds.video : hints.wantsVideo;

  let needTranslation = mappingDriven
    ? mappingNeeds.translation
    : targetLanguages.length > 0 || hints.mentionsTranslate;

  let needSummary = mappingDriven ? mappingNeeds.summary : hints.wantsSummary;

  const visualAspect = inferVisualAspectFromPromptAndRule(
    contentPrompt,
    rule,
    hints,
  );

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
      config: coerceConfigForGeneration(WorkflowNodeType.ImageGeneration, {
        aspectRatio: visualAspect,
        quality: hints.wantsCarousel
          ? NodeImageQuality.Hd
          : NodeImageQuality.Standard,
      }),
    });
  }

  if (needVideo) {
    nodes.push({
      type: WorkflowNodeType.VideoGeneration,
      order: nodes.length + 1,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.VideoGeneration, {
        aspectRatio: visualAspect,
        duration: /\b(4|four)\s*s(ec)?\b/i.test(contentPrompt)
          ? 4
          : /\b(12|twelve)\s*s(ec)?\b/i.test(contentPrompt)
            ? 12
            : /\b(16|sixteen)\s*s(ec)?\b/i.test(contentPrompt)
              ? 16
              : /\b(20|twenty)\s*s(ec)?\b/i.test(contentPrompt)
                ? 20
                : 8,
      }),
    });
  }

  if (hints.wantsTranscription) {
    nodes.push({
      type: WorkflowNodeType.Transcription,
      order: nodes.length + 1,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Transcription, {
        sourceType: NodeMediaSourceType.Audio,
        language: 'auto',
      }),
    });
  }

  return nodes.map((n, idx) => ({ ...n, order: idx + 1 }));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const NODE_TYPE_ALIASES: Record<string, WorkflowNodeType> = {
  keyword_planner: WorkflowNodeType.KeywordPlanner,
  keywordplanner: WorkflowNodeType.KeywordPlanner,
  KeywordPlanner: WorkflowNodeType.KeywordPlanner,
  text_generation: WorkflowNodeType.TextGeneration,
  textgeneration: WorkflowNodeType.TextGeneration,
  TextGeneration: WorkflowNodeType.TextGeneration,
  image_generation: WorkflowNodeType.ImageGeneration,
  imagegeneration: WorkflowNodeType.ImageGeneration,
  video_generation: WorkflowNodeType.VideoGeneration,
  videogeneration: WorkflowNodeType.VideoGeneration,
  translation: WorkflowNodeType.Translation,
  Translation: WorkflowNodeType.Translation,
  transcription: WorkflowNodeType.Transcription,
  Transcription: WorkflowNodeType.Transcription,
  summarization: WorkflowNodeType.Summarization,
  Summarization: WorkflowNodeType.Summarization,
};

function nodeTypeFromAiValue(value: unknown): WorkflowNodeType | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const normKey = trimmed.replace(/[\s-]+/g, '_');
  const lowered = normKey.toLowerCase();
  const compact = lowered.replace(/_/g, '');

  const fromAlias =
    NODE_TYPE_ALIASES[trimmed] ??
    NODE_TYPE_ALIASES[lowered] ??
    NODE_TYPE_ALIASES[normKey];
  if (fromAlias) return fromAlias;

  const allowed = Object.values(WorkflowNodeType) as string[];
  if (allowed.includes(lowered)) return lowered as WorkflowNodeType;

  for (const t of allowed) {
    if (t.replace(/_/g, '') === compact) {
      return t as WorkflowNodeType;
    }
  }
  return null;
}

function parseNodesFromLlm(aiNodes: unknown[]): GeneratedWorkflowNode[] {
  const normalized: GeneratedWorkflowNode[] = [];
  for (const item of aiNodes) {
    if (!item || typeof item !== 'object') continue;
    const asObj = item as Record<string, unknown>;
    const type = nodeTypeFromAiValue(asObj.type);
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
  return normalized;
}

function salvagePlannerAndText(
  nodes: GeneratedWorkflowNode[],
): GeneratedWorkflowNode[] | null {
  const texts = nodes.filter(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  );
  if (texts.length === 0) return null;
  const textNode =
    texts.slice().sort((a, b) => a.order - b.order)[0] ?? texts[0]!;

  let planners = nodes.filter(
    (n) => n.type === WorkflowNodeType.KeywordPlanner,
  );
  if (planners.length > 1) {
    planners = [planners.slice().sort((a, b) => a.order - b.order)[0]!];
  }

  const others = nodes.filter(
    (n) =>
      n.type !== WorkflowNodeType.KeywordPlanner &&
      n.type !== WorkflowNodeType.TextGeneration,
  );

  const planner =
    planners[0] ??
    ({
      type: WorkflowNodeType.KeywordPlanner,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.KeywordPlanner, {}),
    } satisfies GeneratedWorkflowNode);

  const mergedOthers = [...others].sort((a, b) => a.order - b.order);
  return [planner, textNode, ...mergedOthers];
}

export function normalizeWorkflowAiNodes(
  aiNodes: unknown,
  rule: Rule,
  contentPrompt: string,
  logger: Logger,
): GeneratedWorkflowNode[] {
  if (!Array.isArray(aiNodes)) {
    logger.warn(
      `workflow plan normalize: ai output is not an array; using fallback. snippet=${String(aiNodes).slice(0, 80)}`,
    );
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  let parsed = parseNodesFromLlm(aiNodes);
  if (!parsed.length) {
    logger.warn(
      'workflow plan normalize: no valid node types after parse; using fallback',
    );
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  const salvaged = salvagePlannerAndText(parsed);
  if (!salvaged) {
    const textCount = parsed.filter(
      (n) => n.type === WorkflowNodeType.TextGeneration,
    ).length;
    logger.warn(
      `workflow plan normalize: missing text_generation (count=${textCount}); using fallback`,
    );
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  const plannerCount = salvaged.filter(
    (n) => n.type === WorkflowNodeType.KeywordPlanner,
  ).length;
  const textCount = salvaged.filter(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  ).length;
  if (plannerCount > 1 || textCount !== 1) {
    logger.warn(
      `workflow plan normalize: unexpected planner/text counts after salvage (planner=${plannerCount} text=${textCount}); using fallback`,
    );
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  const planner = salvaged.find(
    (n) => n.type === WorkflowNodeType.KeywordPlanner,
  )!;
  const textNode = salvaged.find(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  )!;
  const others = salvaged.filter(
    (n) =>
      n.type !== WorkflowNodeType.KeywordPlanner &&
      n.type !== WorkflowNodeType.TextGeneration,
  );

  const ordered = [planner, textNode, ...others];
  return ordered.map((n, idx) => ({ ...n, order: idx + 1 }));
}

function buildPlanningPrompt(
  rule: Rule,
  contentPrompt: string,
  mappingContext: Array<{
    channel: string;
    needsCaption: string;
    needsMedia: string | null;
  }>,
): string {
  const summary = buildRuleSummary(rule);
  const hints = inferContentPromptHints(contentPrompt);

  const nodeSchemas = {
    keyword_planner: {
      config:
        'provider?, model?, temperature?, maxTokens? — defaults are fine if omitted',
    },
    text_generation: {
      config:
        'outputFormat: paragraph | bullets | caption; tone; textLength: short | medium | long; optional provider/model',
    },
    image_generation: {
      config:
        'model dall-e-3 | dall-e-2; quality standard | hd; style natural | vivid; aspectRatio 1:1 | 16:9 | 9:16 | 4:5',
    },
    translation: {
      config: 'sourceLanguage, targetLanguage (ISO or auto), formalityLevel',
    },
    video_generation: {
      config:
        'model sora-2 | sora-2-pro; duration 4|8|12|16|20; resolution 720p|1080p (1080p only with sora-2-pro); aspectRatio',
    },
    transcription: { config: 'sourceType audio|video; language; model whisper-1' },
    summarization: {
      config: 'summaryLength; outputFormat paragraph|bullets|tldr; sourceNodeRef',
    },
  };

  const examples = `Example A — short social caption + image:
{"nodes":[{"type":"keyword_planner","order":1,"isLocked":false,"config":{}},{"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"caption","tone":"friendly","textLength":"short"}},{"type":"image_generation","order":3,"isLocked":false,"config":{"model":"dall-e-3","quality":"standard","aspectRatio":"1:1"}}]}

Example B — vertical video for Reels:
{"nodes":[{"type":"keyword_planner","order":1,"isLocked":false,"config":{}},{"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"caption","tone":"casual","textLength":"medium"}},{"type":"video_generation","order":3,"isLocked":false,"config":{"model":"sora-2","duration":8,"resolution":"720p","aspectRatio":"9:16"}}]}

Example C — long article + translate:
{"nodes":[{"type":"keyword_planner","order":1,"isLocked":false,"config":{}},{"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"paragraph","tone":"professional","textLength":"long"}},{"type":"translation","order":3,"isLocked":false,"config":{"sourceLanguage":"en","targetLanguage":"th","formalityLevel":"casual"}}]}`;

  return [
    'You are a workflow planning engine for a multi-channel content platform.',
    'Return ONLY a JSON object: {"nodes":[...]} — no markdown, no code fences.',
    '',
    '=== PRIMARY CONTENT REQUEST (highest priority) ===',
    contentPrompt.trim(),
    '',
    '=== INFERRED HINTS (use with rule; do not echo) ===',
    JSON.stringify(hints),
    '',
    '=== RULE SUMMARY (structured) ===',
    JSON.stringify(summary, null, 2),
    '',
    '=== CHANNEL MAPPINGS ===',
    JSON.stringify(mappingContext, null, 2),
    '',
    '=== DECISION MATRIX ===',
    '- Always include exactly one keyword_planner (first) and one text_generation (second).',
    '- Choose text_generation outputFormat from the content request: short social → caption; long editorial → paragraph.',
    '- If mappings needCaption is translatedText OR user asks for translation → translation after text.',
    '- If mappings needCaption is summary OR user asks for summary → summarization (usually after text; set sourceNodeRef if needed).',
    '- If mappings needMedia is image OR user asks for carousel/still creative → image_generation with aspectRatio matching channel (IG/TikTok often 9:16 or 4:5).',
    '- If mappings needMedia is video OR user asks for reel/short/video → video_generation; prefer 9:16 for vertical platforms.',
    '- transcription only if user explicitly needs audio/podcast transcribed.',
    '- Tailor config enums to the CONTENT REQUEST above, not generic defaults.',
    '',
    '=== NODE CONFIG KEYS (snake_case type strings) ===',
    JSON.stringify(nodeSchemas, null, 2),
    '',
    '=== EXAMPLES ===',
    examples,
  ].join('\n');
}

@Injectable()
export class WorkflowGenerationService {
  private readonly logger = new Logger(WorkflowGenerationService.name);

  constructor(private readonly llm: LlmService) {}

  private fallback(rule: Rule, contentPrompt: string): GeneratedWorkflowNode[] {
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  private normalizeAiOutput(
    aiNodes: unknown,
    rule: Rule,
    contentPrompt: string,
  ): GeneratedWorkflowNode[] {
    return normalizeWorkflowAiNodes(aiNodes, rule, contentPrompt, this.logger);
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

    const prompt = buildPlanningPrompt(rule, contentPrompt, mappingContext);

    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const model = this.llm.getChatModel({
          temperature: WORKFLOW_PLAN_TEMPERATURE,
        });

        const res = await model.invoke([
          [
            'system',
            'You are a workflow planning engine. Output only valid minified or pretty JSON with a top-level "nodes" array.',
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
          : ((parsed as { nodes?: unknown })?.nodes ?? []);

        if (!Array.isArray(nodes) || !nodes.length) {
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
          this.logger.warn('Using fallback workflow (content-aware)');
          return this.fallback(rule, contentPrompt);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return this.fallback(rule, contentPrompt);
  }
}
