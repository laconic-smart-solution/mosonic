import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workflow, WorkflowStatus } from './schemas/workflow.schema';

@Injectable()
export class WorkflowResolveService {
  constructor(
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<Workflow>,
  ) {}

  /** Latest Ready non-template workflow for a rule. */
  async resolveLatestReadyWorkflowId(ruleRef: string): Promise<string | null> {
    const latest = await this.workflowModel
      .findOne({
        ruleRef,
        status: WorkflowStatus.Ready,
        isTemplate: false,
      })
      .sort({ updatedAt: -1 })
      .exec();
    return latest?.workflowId ?? null;
  }
}
