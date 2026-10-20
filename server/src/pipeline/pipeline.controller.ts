import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express, Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import {
  ruleExtractMaxFileBytes,
  ruleExtractMaxFiles,
} from '../rule/extract-limits';
import { MulterExceptionFilter } from '../rule/multer-exception.filter';
import {
  PipelinePageQueryDto,
  PipelinePageResponseDto,
} from './dto/pipeline-page-query.dto';
import { NodeReviewDto } from './dto/node-review.dto';
import { EstimatePipelineDto } from './dto/estimate-pipeline.dto';
import { ReplanPipelineDto } from './dto/replan-pipeline.dto';
import { PipelineStatsQueryDto } from './dto/pipeline-stats-query.dto';
import { RetryNodeDto } from './dto/retry-node.dto';
import { SkipNodeDto } from './dto/skip-node.dto';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import {
  UpdatePipelineDto,
  UpdatePipelineResponseDto,
} from './dto/update-pipeline.dto';
import { parsePipelineStartMultipart } from './parse-pipeline-start-multipart';
import { PipelineService } from './pipeline.service';

function isMultipart(req: Request): boolean {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  return ct.includes('multipart/form-data');
}

function parseOptionalBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

function parseOptionalStringArray(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return undefined;
      return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      return undefined;
    }
  }
  return undefined;
}
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
    return this.pipelineService.estimatePipeline(dto, auth);
  }

  @Post('start')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('files', ruleExtractMaxFiles(), {
      limits: { fileSize: ruleExtractMaxFileBytes() },
    }),
  )
  startPipeline(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);

    if (isMultipart(req) || (files && files.length > 0)) {
      const attachments = parsePipelineStartMultipart(
        files,
        body.contentPrompt,
        body.urls,
      );
      const executionMode =
        body.executionMode === 'step' || body.executionMode === 'auto'
          ? body.executionMode
          : undefined;
      return this.pipelineService.startPipeline({
        workflowId: String(body.workflowId ?? ''),
        ruleId: String(body.ruleId ?? ''),
        contentPrompt: attachments.contentPrompt,
        files: attachments.files,
        urls: attachments.urls,
        useLearnings: parseOptionalBoolean(body.useLearnings),
        executionMode,
        reviewNodeIds: parseOptionalStringArray(body.reviewNodeIds),
        auth,
      });
    }

    const dto = body as unknown as StartPipelineDto;
    return this.pipelineService.startPipeline({
      workflowId: dto.workflowId,
      ruleId: dto.ruleId,
      contentPrompt: dto.contentPrompt ?? '',
      useLearnings: dto.useLearnings,
      executionMode: dto.executionMode,
      reviewNodeIds: dto.reviewNodeIds,
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
    @Body() body: ReplanPipelineDto,
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
  tryFinalize(@Req() req: Request, @Param('id') pipelineId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.tryFinalizePipeline(pipelineId, auth);
  }

  @Get(':id/nodes/:nodeId/review/estimate')
  estimateReviewRegenerate(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Param('nodeId') nodeId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.estimateReviewRegenerate(
      pipelineId,
      nodeId,
      auth,
    );
  }

  @Post(':id/nodes/:nodeId/review')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  reviewNode(
    @Req() req: Request,
    @Param('id') pipelineId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: NodeReviewDto,
  ): Promise<{ success: boolean; noop?: boolean }> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.pipelineService.reviewNode(pipelineId, nodeId, dto, auth);
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
