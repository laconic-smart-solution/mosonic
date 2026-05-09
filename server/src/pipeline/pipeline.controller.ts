import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  PipelinePageQueryDto,
  PipelinePageResponseDto,
} from './dto/pipeline-page-query.dto';
import { RetryNodeDto } from './dto/retry-node.dto';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('pageable')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async pageable(
    @Body() body: PipelinePageQueryDto,
  ): Promise<PipelinePageResponseDto> {
    const { data, total } = await this.pipelineService.findPage(body);
    const page = body.page ?? 1;
    const limit = body.limit ?? 10;
    const totalPages = Math.ceil(total / limit) || 0;
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

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
