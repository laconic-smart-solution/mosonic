import { Injectable } from '@nestjs/common';
import { OrchestrationService } from '../orchestration/orchestration.service';

@Injectable()
export class PipelineService {
  constructor(private readonly orchestration: OrchestrationService) {}

  startPipeline(args: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
  }): Promise<{ pipelineId: string }> {
    return this.orchestration.startPipeline({
      ...args,
      userId: 'system',
    });
  }

  async retryNode(pipelineId: string, _nodeId: string): Promise<{ success: boolean }> {
    await this.orchestration.retryNode(pipelineId);
    return { success: true };
  }

  getPipeline(pipelineId: string): Promise<{
    pipeline: {
      pipelineId: string;
      workflowRef: string;
      ruleRef: string;
      contentPrompt: string;
      status: string;
      startedAt: Date;
      completedAt: Date | null;
    };
    nodes: Array<{
      nodeId: string;
      type: string;
      order: number;
      status: string;
      output: Record<string, unknown> | null;
      retryCount: number;
      executedAt: Date | null;
    }>;
  }> {
    return this.orchestration.getPipeline(pipelineId);
  }
}
