import { Injectable, Logger } from '@nestjs/common';
import type { Rule } from '../../rule/schemas/rule.schema';
import type { WorkflowQAAnswersDto } from '../dto/workflow-qa-answers.dto';
import {
  buildWorkflowNodes,
  toPersistableGraph,
  type GeneratedWorkflowNode,
} from '../workflow-structure.builder';
import { resolveRuleChannelIds } from '../workflow-qa-channels.constants';
import { WorkflowConfigGenerationService } from './workflow-config-generation.service';

@Injectable()
export class WorkflowGenerationService {
  private readonly logger = new Logger(WorkflowGenerationService.name);

  constructor(
    private readonly configGen: WorkflowConfigGenerationService,
  ) {}

  async generate(
    rule: Rule,
    answers: WorkflowQAAnswersDto,
    billing?: { userId: string; workflowId: string },
  ): Promise<GeneratedWorkflowNode[]> {
    const ruleChannelIds = resolveRuleChannelIds(rule.channels);
    const logical = buildWorkflowNodes(answers, ruleChannelIds);
    const configured = await this.configGen.generateConfigs(
      logical,
      rule,
      answers.additionalMessage ?? '',
      billing,
    );
    const graph = toPersistableGraph(configured, ruleChannelIds);

        this.logger.log(
      `Workflow generated (v3 Q&A): nodes=${graph.map((n) => n.type).join(' → ')}`,
    );

    return graph;
  }
}

export type { GeneratedWorkflowNode } from '../workflow-structure.builder';
