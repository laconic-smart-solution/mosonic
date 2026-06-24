import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { tenancyFromLocalUser } from '../../auth/tenancy.util';
import { ReplayPipelineJobDto } from '../../admin/dto/admin-query-ext.dto';
import {
  type NodeJobPayload,
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  pipelineNodeReplayJobId,
} from '../../orchestration/types/node-job.payload';
import { User, UserRole } from '../../users/schemas/user.schema';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/pipeline/jobs')
export class AdminPipelineJobsController {
  constructor(
    @InjectQueue(PIPELINE_NODES_DLQ)
    private readonly dlq: Queue<NodeJobPayload>,
    @InjectQueue(PIPELINE_NODES_QUEUE)
    private readonly mainQueue: Queue<NodeJobPayload>,
  ) {}

  @Post('replay')
  @UsePipes(bodyPipe)
  async replay(
    @Req() req: Request,
    @Body() body: ReplayPipelineJobDto,
  ): Promise<{ success: boolean }> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    if (auth.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
    const job = await this.dlq.getJob(body.jobId);
    if (!job?.data) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NotFound',
        message: `Job ${body.jobId} not found`,
      });
    }
    await this.mainQueue.add('run-node', job.data, {
      jobId: pipelineNodeReplayJobId(job.data.pipelineId, job.data.nodeId),
    });
    await job.remove();
    return { success: true };
  }
}
