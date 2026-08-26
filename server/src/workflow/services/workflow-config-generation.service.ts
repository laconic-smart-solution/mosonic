import { Injectable, Logger } from '@nestjs/common';
import { safeJsonParse as sharedSafeJsonParse } from '../../common/utils/json-parse.util';
import { LlmService } from '../../llm/llm.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import { parseWorkflowNodeConfig } from '../../nodes/workflow-node-config.zod';
import type { Rule } from '../../rule/schemas/rule.schema';
import type { LogicalWorkflowNode } from '../workflow-structure.builder';

const CONFIG_GEN_TEMPERATURE = 0.55;

function mergeValidatedNodeConfig(
  type: WorkflowNodeType,
  base: Record<string, unknown>,
  ai: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = { ...base, ...(ai && typeof ai === 'object' ? ai : {}) };
  const parsed = parseWorkflowNodeConfig(type, merged);
  if (parsed.ok) {
    return parsed.data as Record<string, unknown>;
  }
  const fallback = parseWorkflowNodeConfig(type, base);
  if (fallback.ok) {
    return fallback.data as Record<string, unknown>;
  }
  return base;
}

@Injectable()
export class WorkflowConfigGenerationService {
  private readonly logger = new Logger(WorkflowConfigGenerationService.name);

  constructor(private readonly llm: LlmService) {}

  async generateConfigs(
    nodes: LogicalWorkflowNode[],
    rule: Rule,
    additionalMessage: string,
  ): Promise<LogicalWorkflowNode[]> {
    if (!nodes.length) {
      return nodes;
    }

    const prompt = this.buildConfigPrompt(nodes, rule, additionalMessage);
    const model = this.llm.getChatModel({
      temperature: CONFIG_GEN_TEMPERATURE,
    });

    const res = await model.invoke([
      [
        'system',
        'You configure a content generation pipeline. Output ONLY valid JSON. No markdown. No explanation.',
      ],
      ['human', prompt],
    ]);

    const text =
      typeof res.content === 'string'
        ? res.content
        : JSON.stringify(res.content ?? null);

    let configByNodeId: Record<
      string,
      { userPrompt?: string; config?: Record<string, unknown> }
    > = {};

    try {
      const parsed = sharedSafeJsonParse(text) as Record<
        string,
        unknown
      > | null;
      if (parsed && typeof parsed === 'object') {
        configByNodeId = parsed as typeof configByNodeId;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to parse workflow config JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return nodes.map((node) => {
      const ai = configByNodeId[node.nodeId];
      const aiConfig =
        ai?.config && typeof ai.config === 'object' ? ai.config : undefined;
      return {
        ...node,
        userPrompt:
          typeof ai?.userPrompt === 'string' ? ai.userPrompt : node.userPrompt,
        config: mergeValidatedNodeConfig(node.type, node.config, aiConfig),
      };
    });
  }

  private buildConfigPrompt(
    nodes: LogicalWorkflowNode[],
    rule: Rule,
    additionalMessage: string,
  ): string {
    const nodeSummaries = nodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      targetChannels: n.targetChannels,
      structuralConfig: n.config,
    }));

    return [
      'You are configuring a content generation pipeline. Return ONLY a JSON object, no preamble.',
      '',
      'Brand Rule context:',
      JSON.stringify(rule, null, 2),
      '',
      `User's additional instructions for this run:`,
      `"${additionalMessage.replace(/"/g, '\\"')}"`,
      '',
      'Nodes to configure (do not change type/order/targetChannels — only return userPrompt and config per nodeId):',
      JSON.stringify(nodeSummaries, null, 2),
      '',
      'Return JSON shaped exactly as:',
      '{',
      '  "<nodeId>": { "userPrompt": "...", "config": { ... } },',
      '  ...',
      '}',
      '',
      'For intelligence nodes, searchType MUST be one of: trend, market, competitor, all, custom.',
      'Use searchType "all" unless the user clearly needs a narrower scope; set customPrompt only when searchType is custom.',
      'For keyword_planner nodes, align keyword focus with campaign goals and SEO priorities from the rule.',
      'For summarization nodes, preserve sourceNodeRef; set summaryLength and outputFormat appropriate to the channel.',
      'For translation nodes, preserve targetLanguage in config; you may set sourceLanguage and formalityLevel.',
      'For image/video nodes, set style, aspectRatio, and quality appropriate to target channels.',
    ].join('\n');
  }
}
