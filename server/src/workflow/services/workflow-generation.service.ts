import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Rule } from '../../rule/schemas/rule.schema';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { WorkflowQAAnswersDto } from '../dto/workflow-qa-answers.dto';
import {
  buildWorkflowNodes,
  toPersistableGraph,
  type GeneratedWorkflowNode,
} from '../workflow-structure.builder';
import { resolveRuleChannelIds } from '../workflow-qa-channels.constants';
import { WorkflowConfigGenerationService } from './workflow-config-generation.service';

/** Fixed default pipeline: keyword → intelligence → text (+ branch/adapt/merge). */
export const DEFAULT_WORKFLOW_STRUCTURE_ANSWERS: WorkflowQAAnswersDto = {
  useWebSearch: true,
  useKeywordPlanner: true,
  generateSummary: false,
  summaryChannels: [],
  generateImage: false,
  imageChannels: [],
  generateVideo: false,
  videoChannels: [],
  translate: false,
  translationChannels: [],
  targetLanguages: [],
  additionalMessage: '',
};

@Injectable()
export class WorkflowGenerationService {
  private readonly logger = new Logger(WorkflowGenerationService.name);

  constructor(private readonly configGen: WorkflowConfigGenerationService) {}

  /**
   * Deterministic default graph — no LLM, no AI config enrichment.
   * Safe to apply without charging workflow-generation credits.
   */
  buildDefaultStructure(rule: Rule): GeneratedWorkflowNode[] {
    const ruleChannelIds = resolveRuleChannelIds(rule.channels);
    const logical = buildWorkflowNodes(
      DEFAULT_WORKFLOW_STRUCTURE_ANSWERS,
      ruleChannelIds,
    );
    if (ruleChannelIds.length > 0) {
      // The Q&A wizard's `generateImage`/`imageChannels` path only ever
      // resolves to instagram/facebook/linkedin/tiktok (see
      // `resolveQaNodeChannels`), so it can silently produce zero image
      // nodes for a rule outside that set or with >1 channel. The default
      // structure has no wizard behind it to pick channels, so add the
      // image node directly, targeting the rule's first channel — this
      // guarantees at least one lane gets an image node regardless of
      // which channels the rule actually has.
      logical.push({
        nodeId: randomUUID(),
        type: WorkflowNodeType.ImageGeneration,
        order: logical.length + 1,
        isLocked: false,
        targetChannels: [ruleChannelIds[0]],
        config: {},
        userPrompt: '',
      });
    }
    const graph = toPersistableGraph(logical, ruleChannelIds);
    this.logger.log(
      `Default workflow structure: nodes=${graph.map((n) => n.type).join(' → ')}`,
    );
    return graph;
  }

  async generate(
    rule: Rule,
    answers: WorkflowQAAnswersDto,
  ): Promise<GeneratedWorkflowNode[]> {
    const ruleChannelIds = resolveRuleChannelIds(rule.channels);
    const logical = buildWorkflowNodes(answers, ruleChannelIds);
    const configured = await this.configGen.generateConfigs(
      logical,
      rule,
      answers.additionalMessage ?? '',
    );
    const graph = toPersistableGraph(configured, ruleChannelIds);

    this.logger.log(
      `Workflow generated (v3 Q&A): nodes=${graph.map((n) => n.type).join(' → ')}`,
    );

    return graph;
  }
}

export type { GeneratedWorkflowNode } from '../workflow-structure.builder';
