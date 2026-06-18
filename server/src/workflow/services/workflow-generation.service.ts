import { Injectable, Logger } from '@nestjs/common';
import { CreditBillingService } from '../../credit/credit-billing.service';
import { LlmService } from '../../llm/llm.service';
import { extractUsageFromAiMessage } from '../../nodes/langchain-usage.util';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
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
import {
  ENRICHMENT_TYPE_ORDER,
  LANE_NODE_ORDER,
  TRUNK_TAIL_AFTER_TEXT_ORDER,
} from '../workflow-node-next-matrix';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GeneratedWorkflowNode = {
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  config: Record<string, unknown>;
};

/** Workflow structure mode — drives how nodes are arranged */
export type WorkflowStructure = 'linear' | 'graph';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_PLAN_TEMPERATURE = 0.55;

/**
 * Nodes that must appear BEFORE text_generation on the trunk.
 * They enrich the generation context, they don't generate content themselves.
 */
const ENRICHMENT_TYPES: WorkflowNodeType[] = ENRICHMENT_TYPE_ORDER.map(
  (t) => t as WorkflowNodeType,
);

/**
 * Nodes that are only valid on the trunk (before branch).
 * They must never appear inside a lane.
 */
const TRUNK_ONLY_TYPES: WorkflowNodeType[] = [
  WorkflowNodeType.KeywordPlanner,
  WorkflowNodeType.Intelligence,
  WorkflowNodeType.Transcription,
  WorkflowNodeType.Branch,
  WorkflowNodeType.Merge,
];

// ─────────────────────────────────────────────────────────────────────────────
// Config coercion (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Rule inference helpers (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function inferTextToneFromRule(rule: Rule): NodeTextTone {
  const raw = (rule.brand.brandTone[0] ?? 'friendly').toLowerCase();
  if (raw.includes('profess')) return NodeTextTone.Professional;
  if (raw.includes('formal')) return NodeTextTone.Formal;
  if (raw.includes('wit') || raw.includes('humor')) return NodeTextTone.Witty;
  if (raw.includes('casual')) return NodeTextTone.Casual;
  if (raw.includes('friend')) return NodeTextTone.Friendly;
  return NodeTextTone.Friendly;
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
  if (hints.longForm) return NodeOutputFormat.Paragraph;
  if (
    hints.prefersCaption ||
    format.toLowerCase().includes('caption') ||
    /\bcaption\b/i.test(rule.campaign.contentFormats.join(' '))
  ) {
    return NodeOutputFormat.Caption;
  }
  if (format.toLowerCase().includes('bullet')) return NodeOutputFormat.Bullets;
  return NodeOutputFormat.Paragraph;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content prompt hint inference (enhanced)
// ─────────────────────────────────────────────────────────────────────────────

export type ContentPromptHints = {
  wantsVideo: boolean;
  wantsCarousel: boolean;
  wantsTranscription: boolean;
  wantsSummary: boolean;
  wantsIntelligence: boolean; // ← NEW: wants trend/market data enrichment
  prefersCaption: boolean;
  longForm: boolean;
  mentionsTranslate: boolean;
};

export function inferContentPromptHints(
  contentPrompt: string,
): ContentPromptHints {
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
    wantsSummary: /\b(summary|tl;dr|tldr|executive\s+summary|digest)\b/i.test(
      pl,
    ),
    wantsIntelligence:
      /\b(trend|trending|viral|market\s+insight|competitor|research|data.driven|intelligence)\b/i.test(
        pl,
      ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Structure inference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines workflow structure from rule.
 * graph  = channels >= 2 → uses branch/adapt/merge
 * linear = channel  == 1 → flat sequential nodes
 */
function inferStructure(rule: Rule): WorkflowStructure {
  return rule.channels.length >= 2 ? 'graph' : 'linear';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule summary (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Fallback node builder (REWRITTEN — correct ordering + graph awareness)
// ─────────────────────────────────────────────────────────────────────────────

export function generateFallbackWorkflowNodes(
  rule: Rule,
  contentPrompt: string,
): GeneratedWorkflowNode[] {
  return buildFallbackNodes(rule, contentPrompt);
}

function buildFallbackNodes(
  rule: Rule,
  contentPrompt: string,
): GeneratedWorkflowNode[] {
  const hints = inferContentPromptHints(contentPrompt);
  const structure = inferStructure(rule);
  const nodes: GeneratedWorkflowNode[] = [];

  // ─── Determine what content nodes are needed ──────────────────────────────

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

  const needImage = mappingDriven
    ? mappingNeeds.image
    : hasVisualChannel && (!hints.wantsVideo || hints.wantsCarousel);

  const needVideo = mappingDriven ? mappingNeeds.video : hints.wantsVideo;
  const needTranslation = mappingDriven
    ? mappingNeeds.translation
    : targetLanguages.length > 0 || hints.mentionsTranslate;
  const needSummary = mappingDriven ? mappingNeeds.summary : hints.wantsSummary;

  const visualAspect = inferVisualAspectFromPromptAndRule(
    contentPrompt,
    rule,
    hints,
  );
  const textFormat = textOutputFormatFrom(rule, hints);
  const textTone = inferTextToneFromRule(rule);

  // ─── PHASE 1: Enrichment nodes (ALWAYS before text_generation) ────────────
  //
  // NEXT_MATRIX order: keyword_planner → intelligence → text_generation
  // transcription → text_generation (if transcription-based workflow)
  //
  // These are trunk-only nodes. They NEVER appear in lanes.

  if (hints.wantsTranscription) {
    // Transcription-based workflow: transcribe first → feed into text
    nodes.push({
      type: WorkflowNodeType.Transcription,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Transcription, {
        sourceType: NodeMediaSourceType.Audio,
        language: 'auto',
      }),
    });
  } else {
    // Standard enrichment path: keyword → [intelligence] → text

    nodes.push({
      type: WorkflowNodeType.KeywordPlanner,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.KeywordPlanner, {}),
    });

    if (hints.wantsIntelligence) {
      nodes.push({
        type: WorkflowNodeType.Intelligence,
        order: 0,
        isLocked: false,
        config: coerceConfigForGeneration(WorkflowNodeType.Intelligence, {}),
      });
    }
  }

  // ─── PHASE 2: Text generation (always required, always after enrichment) ──

  nodes.push({
    type: WorkflowNodeType.TextGeneration,
    order: 0,
    isLocked: false,
    config: coerceConfigForGeneration(WorkflowNodeType.TextGeneration, {
      outputFormat: textFormat,
      tone: textTone,
      textLength: hints.longForm
        ? NodeSummaryLength.Long
        : NodeSummaryLength.Medium,
    }),
  });

  // ─── PHASE 3: Trunk tail nodes ────────────────────────────────────────────
  //
  // Summary and Translation on the trunk apply to ALL channels before branching.
  // Only add them to trunk when:
  //   - ALL channels need the same translation (e.g. entire campaign in Thai)
  //   - Or it's a linear workflow (single channel)
  //
  // In graph mode, per-channel translation/summary belongs in lanes (after adapt).
  // Only put translation on trunk in graph mode when targetLanguage is shared across all.

  const trunkTranslation =
    needTranslation &&
    (structure === 'linear' ||
      (targetLanguages.length === 1 &&
        rule.channels.every(
          (c) =>
            normalizedRuleChannelMapping(c).caption ===
            CaptionMappingSource.TranslatedText,
        )));

  const trunkSummary =
    needSummary &&
    (structure === 'linear' ||
      rule.channels.every(
        (c) =>
          normalizedRuleChannelMapping(c).caption ===
          CaptionMappingSource.Summary,
      ));

  if (trunkSummary) {
    nodes.push({
      type: WorkflowNodeType.Summarization,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Summarization, {
        summaryLength: NodeSummaryLength.Short,
      }),
    });
  }

  if (trunkTranslation) {
    nodes.push({
      type: WorkflowNodeType.Translation,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Translation, {
        sourceLanguage: rule.audience.language || 'auto',
        targetLanguage: targetLanguages[0] ?? 'th',
        formalityLevel: NodeFormalityLevel.Casual,
      }),
    });
  }

  // ─── PHASE 4A: Linear tail (single channel — image/video on trunk) ────────

  if (structure === 'linear') {
    if (needImage) {
      nodes.push({
        type: WorkflowNodeType.ImageGeneration,
        order: 0,
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
        order: 0,
        isLocked: false,
        config: coerceConfigForGeneration(WorkflowNodeType.VideoGeneration, {
          aspectRatio: visualAspect,
          duration: inferVideoDuration(contentPrompt),
        }),
      });
    }

    // Linear: no branch/adapt/merge needed
    return assignOrders(nodes);
  }

  // ─── PHASE 4B: Graph mode (multi-channel) ─────────────────────────────────
  //
  // CRITICAL: In graph mode, image/video do NOT go on the trunk.
  // They belong INSIDE lanes (after adapt).
  //
  // The generation service outputs:
  //   1. trunk enrichment + text (+ optional shared summary/translation)
  //   2. branch (router, no AI call)
  //   3. adapt (shared lane template, no lane assigned yet — canvas assigns lanes)
  //   4. optional image/video (lane template nodes, follow adapt in lane)
  //   5. merge (terminal, auto-wired by canvas)
  //
  // Canvas/editor is responsible for:
  //   - assigning lane identifiers to adapt/image/video nodes
  //   - wiring branch → adapt → [image] → [video] → merge per lane

  nodes.push({
    type: WorkflowNodeType.Branch,
    order: 0,
    isLocked: false,
    config: coerceConfigForGeneration(WorkflowNodeType.Branch, {
      mode: 'rule_channels',
    }),
  });

  // Adapt: shared template, lane assigned at canvas time
  nodes.push({
    type: WorkflowNodeType.Adapt,
    order: 0,
    isLocked: false,
    config: coerceConfigForGeneration(WorkflowNodeType.Adapt, {}),
  });

  // Lane-level per-channel translation/summary (when NOT added to trunk)
  if (needSummary && !trunkSummary) {
    nodes.push({
      type: WorkflowNodeType.Summarization,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Summarization, {
        summaryLength: NodeSummaryLength.Short,
      }),
    });
  }

  if (needTranslation && !trunkTranslation) {
    nodes.push({
      type: WorkflowNodeType.Translation,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Translation, {
        sourceLanguage: rule.audience.language || 'auto',
        targetLanguage: targetLanguages[0] ?? 'th',
        formalityLevel: NodeFormalityLevel.Casual,
      }),
    });
  }

  // Lane-level image (after adapt, not on trunk)
  if (needImage) {
    nodes.push({
      type: WorkflowNodeType.ImageGeneration,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.ImageGeneration, {
        aspectRatio: visualAspect,
        quality: hints.wantsCarousel
          ? NodeImageQuality.Hd
          : NodeImageQuality.Standard,
      }),
    });
  }

  // Lane-level video (after adapt/image, not on trunk)
  if (needVideo) {
    nodes.push({
      type: WorkflowNodeType.VideoGeneration,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.VideoGeneration, {
        aspectRatio: visualAspect,
        duration: inferVideoDuration(contentPrompt),
      }),
    });
  }

  // Merge: auto-wired terminal node
  nodes.push({
    type: WorkflowNodeType.Merge,
    order: 0,
    isLocked: false,
    config: coerceConfigForGeneration(WorkflowNodeType.Merge, {
      strategy: 'collect_all',
    }),
  });

  return assignOrders(nodes);
}

// ─────────────────────────────────────────────────────────────────────────────
// Video duration inference helper
// ─────────────────────────────────────────────────────────────────────────────

function inferVideoDuration(contentPrompt: string): number {
  if (/\b(4|four)\s*s(ec)?\b/i.test(contentPrompt)) return 4;
  if (/\b(12|twelve)\s*s(ec)?\b/i.test(contentPrompt)) return 12;
  if (/\b(16|sixteen)\s*s(ec)?\b/i.test(contentPrompt)) return 16;
  if (/\b(20|twenty)\s*s(ec)?\b/i.test(contentPrompt)) return 20;
  return 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order assignment
// ─────────────────────────────────────────────────────────────────────────────

function assignOrders(nodes: GeneratedWorkflowNode[]): GeneratedWorkflowNode[] {
  return nodes.map((n, idx) => ({ ...n, order: idx + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-generation validation + reordering
// Ensures LLM output follows WORKFLOW_NEXT_MATRIX ordering rules (see workflow-node-next-matrix.ts).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures branch + adapt exist for graph workflows (Option 1: inject skeleton).
 */
function ensureGraphSkeleton(
  graph: GeneratedWorkflowNode[],
  logger: Logger,
): GeneratedWorkflowNode[] {
  const branches = graph.filter((n) => n.type === WorkflowNodeType.Branch);
  const adapts = graph.filter((n) => n.type === WorkflowNodeType.Adapt);
  if (branches.length > 1) {
    logger.warn(
      'validateAndReorderNodes: multiple branch nodes; keeping first config',
    );
  }
  if (adapts.length > 1) {
    logger.warn(
      'validateAndReorderNodes: multiple adapt nodes; keeping first config',
    );
  }
  const branch =
    branches[0] ??
    ({
      type: WorkflowNodeType.Branch,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Branch, {
        mode: 'rule_channels',
      }),
    } as GeneratedWorkflowNode);
  if (branches.length === 0) {
    logger.warn('validateAndReorderNodes: injecting branch for graph mode');
  }
  const adapt =
    adapts[0] ??
    ({
      type: WorkflowNodeType.Adapt,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.Adapt, {}),
    } as GeneratedWorkflowNode);
  if (adapts.length === 0) {
    logger.warn('validateAndReorderNodes: injecting adapt for graph mode');
  }
  return [branch, adapt];
}

function trunkTailPriority(t: WorkflowNodeType): number {
  if (t === WorkflowNodeType.TextGeneration) return 0;
  const order = TRUNK_TAIL_AFTER_TEXT_ORDER as readonly string[];
  const idx = order.indexOf(t);
  return idx === -1 ? 50 : idx + 1;
}

/**
 * Validates and reorders a generated node sequence to comply with NEXT_MATRIX.
 * Uses `inferStructure(rule)` for graph vs linear (not only whether the LLM emitted branch).
 */
function validateAndReorderNodes(
  nodes: GeneratedWorkflowNode[],
  rule: Rule,
  contentPrompt: string,
  structure: WorkflowStructure,
  logger: Logger,
): GeneratedWorkflowNode[] {
  const isGraph = structure === 'graph';

  let working = [...nodes];

  if (working.length > 0 && !working.some((n) => n.type === WorkflowNodeType.TextGeneration)) {
    logger.warn(
      'validateAndReorderNodes: missing text_generation; injecting default writer node',
    );
    working.push({
      type: WorkflowNodeType.TextGeneration,
      order: 0,
      isLocked: false,
      config: coerceConfigForGeneration(WorkflowNodeType.TextGeneration, {
        outputFormat: textOutputFormatFrom(
          rule,
          inferContentPromptHints(contentPrompt),
        ),
        tone: inferTextToneFromRule(rule),
        textLength: inferContentPromptHints(contentPrompt).longForm
          ? NodeSummaryLength.Long
          : NodeSummaryLength.Medium,
      }),
    });
  }

  const enrichment: GeneratedWorkflowNode[] = [];
  const trunk: GeneratedWorkflowNode[] = [];
  const laneNodes: GeneratedWorkflowNode[] = [];
  const graph: GeneratedWorkflowNode[] = [];

  for (const node of working) {
    if (node.type === WorkflowNodeType.Merge) {
      continue;
    }

    if (ENRICHMENT_TYPES.includes(node.type)) {
      enrichment.push(node);
      continue;
    }

    if (
      node.type === WorkflowNodeType.Branch ||
      node.type === WorkflowNodeType.Adapt
    ) {
      graph.push(node);
      continue;
    }

    if (
      isGraph &&
      [
        WorkflowNodeType.ImageGeneration,
        WorkflowNodeType.VideoGeneration,
        WorkflowNodeType.Summarization,
        WorkflowNodeType.Translation,
      ].includes(node.type)
    ) {
      laneNodes.push(node);
      continue;
    }

    trunk.push(node);
  }

  const seenEnrichment = new Set<WorkflowNodeType>();
  const dedupedEnrichment = enrichment.filter((n) => {
    if (seenEnrichment.has(n.type)) return false;
    seenEnrichment.add(n.type);
    return true;
  });

  const enrichmentOrder: WorkflowNodeType[] = ENRICHMENT_TYPES;
  dedupedEnrichment.sort(
    (a, b) =>
      enrichmentOrder.indexOf(a.type) - enrichmentOrder.indexOf(b.type),
  );

  trunk.sort((a, b) => {
    const pa = trunkTailPriority(a.type);
    const pb = trunkTailPriority(b.type);
    if (pa !== pb) return pa - pb;
    return 0;
  });

  const graphOrder: WorkflowNodeType[] = [
    WorkflowNodeType.Branch,
    WorkflowNodeType.Adapt,
  ];
  graph.sort((a, b) => graphOrder.indexOf(a.type) - graphOrder.indexOf(b.type));

  const laneOrder: WorkflowNodeType[] = LANE_NODE_ORDER.map(
    (t) => t as WorkflowNodeType,
  );
  laneNodes.sort(
    (a, b) => laneOrder.indexOf(a.type) - laneOrder.indexOf(b.type),
  );

  const graphFinal = isGraph ? ensureGraphSkeleton(graph, logger) : graph;

  const reordered: GeneratedWorkflowNode[] = [
    ...dedupedEnrichment,
    ...trunk,
  ];

  if (isGraph) {
    reordered.push(...graphFinal);
    reordered.push(...laneNodes);
    const mergeNode = working.find((n) => n.type === WorkflowNodeType.Merge);
    reordered.push(
      mergeNode ?? {
        type: WorkflowNodeType.Merge,
        order: 0,
        isLocked: false,
        config: coerceConfigForGeneration(WorkflowNodeType.Merge, {
          strategy: 'collect_all',
        }),
      },
    );
  } else {
    const mergeNode = working.find((n) => n.type === WorkflowNodeType.Merge);
    if (mergeNode) {
      reordered.push(mergeNode);
    }
  }

  return assignOrders(reordered);
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM output parsing (updated to include Intelligence type alias)
// ─────────────────────────────────────────────────────────────────────────────

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const NODE_TYPE_ALIASES: Record<string, WorkflowNodeType> = {
  // keyword planner variants
  keyword_planner: WorkflowNodeType.KeywordPlanner,
  keywordplanner: WorkflowNodeType.KeywordPlanner,
  KeywordPlanner: WorkflowNodeType.KeywordPlanner,
  keywords: WorkflowNodeType.KeywordPlanner,

  // intelligence variants
  intelligence: WorkflowNodeType.Intelligence,
  Intelligence: WorkflowNodeType.Intelligence,
  intel: WorkflowNodeType.Intelligence,

  // text generation variants
  text_generation: WorkflowNodeType.TextGeneration,
  textgeneration: WorkflowNodeType.TextGeneration,
  TextGeneration: WorkflowNodeType.TextGeneration,
  text: WorkflowNodeType.TextGeneration,

  // image variants
  image_generation: WorkflowNodeType.ImageGeneration,
  imagegeneration: WorkflowNodeType.ImageGeneration,
  ImageGeneration: WorkflowNodeType.ImageGeneration,
  image: WorkflowNodeType.ImageGeneration,

  // video variants
  video_generation: WorkflowNodeType.VideoGeneration,
  videogeneration: WorkflowNodeType.VideoGeneration,
  VideoGeneration: WorkflowNodeType.VideoGeneration,
  video: WorkflowNodeType.VideoGeneration,

  // summarization variants
  summarization: WorkflowNodeType.Summarization,
  Summarization: WorkflowNodeType.Summarization,
  summary: WorkflowNodeType.Summarization,
  summarize: WorkflowNodeType.Summarization,

  // translation variants
  translation: WorkflowNodeType.Translation,
  Translation: WorkflowNodeType.Translation,
  translate: WorkflowNodeType.Translation,

  // transcription variants
  transcription: WorkflowNodeType.Transcription,
  Transcription: WorkflowNodeType.Transcription,
  transcribe: WorkflowNodeType.Transcription,

  // graph nodes
  branch: WorkflowNodeType.Branch,
  Branch: WorkflowNodeType.Branch,
  adapt: WorkflowNodeType.Adapt,
  Adapt: WorkflowNodeType.Adapt,
  merge: WorkflowNodeType.Merge,
  Merge: WorkflowNodeType.Merge,
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
    if (t.replace(/_/g, '') === compact) return t as WorkflowNodeType;
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
      isLocked: false,
      config: coerceConfigForGeneration(
        type,
        (asObj.config as Record<string, unknown> | undefined) ?? {},
      ),
    });
  }
  return normalized;
}

function normalizeParsedWorkflowNodes(
  nodes: GeneratedWorkflowNode[],
): GeneratedWorkflowNode[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  return sorted.map((n, idx) => ({ ...n, order: idx + 1, isLocked: false }));
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

  const parsed = parseNodesFromLlm(aiNodes);
  if (!parsed.length) {
    logger.warn(
      'workflow plan normalize: no valid node types after parse; using fallback',
    );
    return generateFallbackWorkflowNodes(rule, contentPrompt);
  }

  const normalized = normalizeParsedWorkflowNodes(parsed);
  const structure = inferStructure(rule);

  // Apply ordering validation to fix common LLM mistakes
  return validateAndReorderNodes(
    normalized,
    rule,
    contentPrompt,
    structure,
    logger,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Planning Prompt (REWRITTEN — explains graph/linear, correct ordering)
// ─────────────────────────────────────────────────────────────────────────────

function buildPlanningPrompt(
  rule: Rule,
  contentPrompt: string,
  structure: WorkflowStructure,
  mappingContext: Array<{
    channel: string;
    needsCaption: string;
    needsMedia: string | null;
  }>,
): string {
  const summary = buildRuleSummary(rule);
  const hints = inferContentPromptHints(contentPrompt);
  const isGraph = structure === 'graph';

  // ─── Node schema reference ─────────────────────────────────────────────────
  const nodeSchemas = {
    keyword_planner: {
      role: 'ENRICHMENT — trunk only, must be FIRST node (before text_generation)',
      config:
        'provider?, model?, temperature?, maxTokens? — defaults fine if omitted',
    },
    intelligence: {
      role: 'ENRICHMENT — trunk only, after keyword_planner, before text_generation. Only include when user asks for trend/market data.',
      config: 'provider?, model? — defaults fine',
    },
    transcription: {
      role: 'ENRICHMENT — trunk only, FIRST node when workflow starts from audio/podcast. Replaces keyword_planner in transcription workflows.',
      config: 'sourceType: audio|video; language: auto|<ISO>; model: whisper-1',
    },
    text_generation: {
      role: 'TRUNK — always required. Always after enrichment nodes. Never inside a lane.',
      config:
        'outputFormat: paragraph|bullets|caption; tone: friendly|professional|casual|formal|witty; textLength: short|medium|long',
    },
    summarization: {
      role: isGraph
        ? 'LANE NODE — comes after adapt inside a lane. Do NOT put on trunk in graph mode unless ALL channels need same summary.'
        : 'TRUNK — comes after text_generation',
      config:
        'summaryLength: short|medium|long; outputFormat: paragraph|bullets|tldr',
    },
    translation: {
      role: isGraph
        ? 'LANE NODE — comes after adapt/summarization inside a lane. Do NOT put on trunk in graph mode unless ALL channels share same target language.'
        : 'TRUNK — comes after text_generation/summarization',
      config:
        'sourceLanguage: <ISO>|auto; targetLanguage: <ISO>; formalityLevel: formal|casual',
    },
    image_generation: {
      role: isGraph
        ? 'LANE NODE — comes after adapt in a lane. NEVER put on trunk in graph mode.'
        : 'TRUNK — comes after text_generation/translation/summarization in linear mode',
      config:
        'model: gpt-image-1|dall-e-3|dall-e-2; quality: standard|hd; style: natural|vivid; aspectRatio: 1:1|16:9|9:16|4:5',
    },
    video_generation: {
      role: isGraph
        ? 'LANE NODE — comes after adapt/image in a lane. NEVER put on trunk in graph mode.'
        : 'TRUNK — comes after image_generation or text in linear mode',
      config:
        'model: sora-2|sora-2-pro; duration: 4|8|12|16|20; resolution: 720p|1080p; aspectRatio: 1:1|16:9|9:16',
    },
    branch: {
      role: 'GRAPH ONLY — trunk router, comes after text_generation trunk. Only include when channels >= 2.',
      config: 'mode: rule_channels',
    },
    adapt: {
      role: 'GRAPH ONLY — lane template node, comes after branch. One shared template (no lane assigned here).',
      config:
        'No config needed here — canvas auto-configures per channel from presets',
    },
    merge: {
      role: 'GRAPH ONLY — terminal node, always last. Auto-wired by canvas.',
      config: 'strategy: collect_all',
    },
  };

  // ─── Structure-specific ordering rules ────────────────────────────────────
  const orderingRules = isGraph
    ? `
=== GRAPH MODE ORDERING (channels: ${rule.channels.map((c) => c.channel).join(', ')}) ===

CORRECT order:
  [enrichment] → text_generation → [trunk summary/translation?] → branch → adapt → [lane image?] → [lane video?] → merge

CRITICAL RULES FOR GRAPH MODE:
1. transcription or keyword_planner FIRST (before text_generation)
2. intelligence AFTER keyword_planner if included
3. text_generation AFTER all enrichment nodes
4. branch AFTER text_generation — never before
5. adapt AFTER branch — represents the per-channel lane template
6. image_generation and video_generation AFTER adapt — inside lanes, NEVER on trunk
7. translation/summarization: put on trunk ONLY if ALL channels share the same need.
   Otherwise put them AFTER adapt in lanes.
8. merge LAST — always terminal

DO NOT put image_generation or video_generation before branch.
DO NOT put adapt before branch.
DO NOT put branch before text_generation.
`
    : `
=== LINEAR MODE ORDERING (single channel: ${rule.channels[0]?.channel ?? 'unknown'}) ===

CORRECT order:
  [enrichment] → text_generation → [summarization?] → [translation?] → [image_generation?] → [video_generation?]

CRITICAL RULES FOR LINEAR MODE:
1. enrichment nodes FIRST (keyword_planner, intelligence, transcription)
2. text_generation AFTER all enrichment
3. summarization AFTER text_generation if needed
4. translation AFTER text_generation/summarization
5. image_generation AFTER text/translation
6. video_generation AFTER image or text
7. NO branch, adapt, or merge in linear mode

DO NOT include branch, adapt, or merge for single-channel workflows.
`;

  // ─── Examples ─────────────────────────────────────────────────────────────
  const linearExample = `Example — Linear, single channel, caption + image:
{"nodes":[
  {"type":"keyword_planner","order":1,"isLocked":false,"config":{}},
  {"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"caption","tone":"friendly","textLength":"short"}},
  {"type":"image_generation","order":3,"isLocked":false,"config":{"model":"gpt-image-1","quality":"standard","aspectRatio":"1:1"}}
]}`;

  const linearVideoExample = `Example — Linear, single channel, vertical video for Reels:
{"nodes":[
  {"type":"keyword_planner","order":1,"isLocked":false,"config":{}},
  {"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"caption","tone":"casual","textLength":"short"}},
  {"type":"video_generation","order":3,"isLocked":false,"config":{"model":"sora-2","duration":8,"resolution":"720p","aspectRatio":"9:16"}}
]}`;

  const graphExample = `Example — Graph, multi-channel (instagram + linkedin), caption + image in lanes:
{"nodes":[
  {"type":"keyword_planner","order":1,"isLocked":false,"config":{}},
  {"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"paragraph","tone":"professional","textLength":"medium"}},
  {"type":"branch","order":3,"isLocked":false,"config":{"mode":"rule_channels"}},
  {"type":"adapt","order":4,"isLocked":false,"config":{}},
  {"type":"image_generation","order":5,"isLocked":false,"config":{"model":"gpt-image-1","quality":"standard","aspectRatio":"1:1"}},
  {"type":"merge","order":6,"isLocked":false,"config":{"strategy":"collect_all"}}
]}`;

  const transcriptionExample = `Example — Linear, transcription-based workflow:
{"nodes":[
  {"type":"transcription","order":1,"isLocked":false,"config":{"sourceType":"audio","language":"auto","model":"whisper-1"}},
  {"type":"text_generation","order":2,"isLocked":false,"config":{"outputFormat":"paragraph","tone":"professional","textLength":"long"}},
  {"type":"translation","order":3,"isLocked":false,"config":{"sourceLanguage":"en","targetLanguage":"th","formalityLevel":"casual"}}
]}`;

  const intelligenceExample = `Example — Graph, intelligence-enriched multi-channel:
{"nodes":[
  {"type":"keyword_planner","order":1,"isLocked":false,"config":{}},
  {"type":"intelligence","order":2,"isLocked":false,"config":{}},
  {"type":"text_generation","order":3,"isLocked":false,"config":{"outputFormat":"caption","tone":"casual","textLength":"medium"}},
  {"type":"branch","order":4,"isLocked":false,"config":{"mode":"rule_channels"}},
  {"type":"adapt","order":5,"isLocked":false,"config":{}},
  {"type":"image_generation","order":6,"isLocked":false,"config":{"model":"gpt-image-1","quality":"standard","aspectRatio":"9:16"}},
  {"type":"merge","order":7,"isLocked":false,"config":{"strategy":"collect_all"}}
]}`;

  const examples = [
    structure === 'linear' ? linearExample : graphExample,
    structure === 'linear' ? linearVideoExample : intelligenceExample,
    hints.wantsTranscription ? transcriptionExample : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    'You are a workflow planning engine for a multi-channel AI content platform.',
    'Return ONLY a JSON object: {"nodes":[...]} — no markdown, no code fences, no explanation.',
    '',
    '=== PRIMARY CONTENT REQUEST (highest priority — tailor workflow to this) ===',
    contentPrompt.trim(),
    '',
    '=== INFERRED HINTS ===',
    JSON.stringify(hints, null, 2),
    '',
    '=== WORKFLOW STRUCTURE ===',
    `structure: ${structure}`,
    `channels: ${rule.channels.length} (${rule.channels.map((c) => c.channel).join(', ')})`,
    '',
    orderingRules,
    '',
    '=== RULE SUMMARY ===',
    JSON.stringify(summary, null, 2),
    '',
    '=== CHANNEL CONTENT MAPPINGS ===',
    JSON.stringify(mappingContext, null, 2),
    '',
    '=== DECISION RULES ===',
    '- When the rule has TWO OR MORE channels, structure is GRAPH: you MUST output branch → adapt → lane media → merge (never a linear trunk-only plan for multi-channel).',
    '- Always start with keyword_planner (or transcription for audio-based workflows).',
    '- Include intelligence node ONLY when user explicitly asks for trends, market data, or competitor research.',
    '- text_generation is always required.',
    '- In GRAPH mode: image/video MUST come after adapt (in lane), never before branch on trunk.',
    '- In LINEAR mode: image/video come after text on trunk.',
    '- Include translation when mapping says translatedText OR user asks for it.',
    '- Include summarization when mapping says summary OR user asks for it.',
    '- Include image when mapping says image OR visual channels present AND user does not exclusively want video.',
    '- Include video when mapping says video OR user asks for reel/video/short.',
    '- Tailor config (tone, aspectRatio, duration, outputFormat) to the content request and channels.',
    '',
    '=== NODE SCHEMAS ===',
    JSON.stringify(nodeSchemas, null, 2),
    '',
    '=== EXAMPLES ===',
    examples,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowGenerationService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowGenerationService {
  private readonly logger = new Logger(WorkflowGenerationService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly creditBilling: CreditBillingService,
  ) {}

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
    billing?: { userId: string; workflowId: string },
  ): Promise<GeneratedWorkflowNode[]> {
    // Determine structure upfront so the prompt can explain the right rules
    const structure = inferStructure(rule);

    const mappingContext = rule.channels.map((ch) => {
      const m = normalizedRuleChannelMapping(ch);
      return {
        channel: ch.channel,
        needsCaption: m.caption,
        needsMedia: m.media,
      };
    });

    const prompt = buildPlanningPrompt(
      rule,
      contentPrompt,
      structure,
      mappingContext,
    );

    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const model = this.llm.getChatModel({
          temperature: WORKFLOW_PLAN_TEMPERATURE,
        });

        const res = await model.invoke([
          [
            'system',
            [
              'You are a workflow planning engine.',
              'Output ONLY valid JSON with a top-level "nodes" array.',
              'No markdown. No code fences. No explanation. Only JSON.',
            ].join(' '),
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

        if (billing) {
          const usage = extractUsageFromAiMessage(res);
          await this.creditBilling.recordAndDeduct({
            userId: billing.userId,
            pipelineRef: billing.workflowId,
            campaignRef: rule.ruleId,
            nodeId: 'workflow-generation',
            nodeType: WorkflowNodeType.TextGeneration,
            provider: LlmProvider.OpenAI,
            providerModel: 'gpt-4o',
            entryType: 'openai_llm',
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        }

        this.logger.log(
          `Workflow generated: structure=${structure} nodes=${normalized.map((n) => n.type).join(' → ')}`,
        );

        return normalized;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Workflow generation attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`,
        );

        if (attempt === MAX_ATTEMPTS) {
          this.logger.warn(
            `Using fallback workflow (content-aware). structure=${structure}`,
          );
          return this.fallback(rule, contentPrompt);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return this.fallback(rule, contentPrompt);
  }
}
