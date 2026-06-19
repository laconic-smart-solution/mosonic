import { Inject, Injectable } from '@nestjs/common';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import { WORKFLOW_REPOSITORY } from '../repositories/tokens';

@Injectable()
export class WorkflowResolveService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
  ) {}

  /** Latest Ready non-template workflow for a rule. */
  async resolveLatestReadyWorkflowId(ruleRef: string): Promise<string | null> {
    const latest = await this.workflows.findLatestReadyByRule(ruleRef);
    return latest?.workflowId ?? null;
  }
}
