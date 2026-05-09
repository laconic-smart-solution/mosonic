import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RetryNodeDto } from './dto/retry-node.dto';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('start')
  startPipeline(
    @Body() dto: StartPipelineDto,
  ): Promise<{ pipelineId: string }> {
    return this.pipelineService.startPipeline({
      workflowId: dto.workflowId,
      ruleId: dto.ruleId,
      contentPrompt: dto.contentPrompt,
    });
  }

  @Post(':id/retry-node')
  retryNode(
    @Param('id') pipelineId: string,
    @Body() dto: RetryNodeDto,
  ): Promise<{ success: boolean }> {
    return this.pipelineService.retryNode(pipelineId, dto.nodeId);
  }

  @Get(':id')
  getPipeline(@Param('id') pipelineId: string): Promise<{
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
    return this.pipelineService.getPipeline(pipelineId);
  }
}
