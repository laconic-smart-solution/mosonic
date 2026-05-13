import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  PipelinePageQueryDto,
  PipelinePageResponseDto,
} from './dto/pipeline-page-query.dto';
import { RetryNodeDto } from './dto/retry-node.dto';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { PipelineService } from './pipeline.service';

@UseGuards(JwtAuthGuard)
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
    @Req() req: Request,
    @Body() body: PipelinePageQueryDto,
  ): Promise<PipelinePageResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const { data, total } = await this.pipelineService.findPage(body, auth);
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
  startPipeline(@Req() req: Request, @Body() dto: StartPipelineDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.startPipeline({
      workflowId: dto.workflowId,
      ruleId: dto.ruleId,
      contentPrompt: dto.contentPrompt,
      auth,
    });
  }

  @Post(':id/retry-node')
  retryNode(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Body() dto: RetryNodeDto,
  ): Promise<{ success: boolean }> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.retryNode(pipelineId, dto.nodeId, auth);
  }

  @Get(':id')
  getPipeline(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.getPipeline(pipelineId, auth);
  }
}
