import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { EstimatePipelineDto } from './dto/estimate-pipeline.dto';
import { PipelineStatsQueryDto } from './dto/pipeline-stats-query.dto';
import { RetryNodeDto } from './dto/retry-node.dto';
import { SkipNodeDto } from './dto/skip-node.dto';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import {
  UpdatePipelineDto,
  UpdatePipelineResponseDto,
} from './dto/update-pipeline.dto';
import { PipelineService } from './pipeline.service';

@UseGuards(JwtAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('stats')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async stats(@Req() req: Request, @Query() query: PipelineStatsQueryDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.getPipelineStats(auth, query.workflowRef);
  }

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

  @Post('estimate')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  estimatePipeline(@Req() req: Request, @Body() dto: EstimatePipelineDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.estimatePipeline(dto.workflowId, auth);
  }

  @Post('start')
  startPipeline(@Req() req: Request, @Body() dto: StartPipelineDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.startPipeline({
      workflowId: dto.workflowId,
      ruleId: dto.ruleId,
      contentPrompt: dto.contentPrompt,
      useLearnings: dto.useLearnings,
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

  @Post(':id/replan')
  replan(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Body() body: { operations: unknown[] },
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.replanPipeline(
      pipelineId,
      body.operations as never,
      auth,
    );
  }

  @Post(':id/cancel')
  cancelPipeline(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.cancelPipeline(pipelineId, auth);
  }

  @Post(':id/resume-lane/:laneId')
  resumeLane(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Param('laneId') laneId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.resumeLane(pipelineId, laneId, auth);
  }

  @Post(':id/skip-lane/:laneId')
  skipLane(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Param('laneId') laneId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.skipLane(pipelineId, laneId, auth);
  }

  @Get(':id/runs')
  getPipelineRuns(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.getPipelineRunSummary(pipelineId, auth);
  }

  @Get(':id/timeline')
  getPipelineTimeline(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.getPipelineTimeline(pipelineId, auth);
  }

  @Post(':id/skip-node')
  skipNode(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Body() dto: SkipNodeDto,
  ): Promise<{ success: boolean }> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.skipNode(pipelineId, dto.nodeId, auth);
  }

  @Post(':id/finalize')
  tryFinalize(
    @Req() req: Request,
    @Param('id') pipelineId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.tryFinalizePipeline(pipelineId, auth);
  }

  @Get(':id')
  getPipeline(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.getPipeline(pipelineId, auth);
  }

  @Patch(':id')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  updatePipeline(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Body() body: UpdatePipelineDto,
  ): Promise<UpdatePipelineResponseDto> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.updateName(pipelineId, body, auth);
  }
}
