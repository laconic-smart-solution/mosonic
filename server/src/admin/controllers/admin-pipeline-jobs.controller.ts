import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../../auth/tenancy.util';
import {
  type NodeJobPayload,
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  pipelineNodeReplayJobId,
} from '../../orchestration/types/node-job.payload';
import { User, UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard)
@Controller('admin/pipeline/jobs')
export class AdminPipelineJobsController {
  constructor(
    @InjectQueue(PIPELINE_NODES_DLQ)
    private readonly dlq: Queue<NodeJobPayload>,
    @InjectQueue(PIPELINE_NODES_QUEUE)
    private readonly mainQueue: Queue<NodeJobPayload>,
  ) {}

  @Post('replay')
  async replay(
    @Req() req: Request,
    @Body() body: { jobId: string },
  ): Promise<{ success: boolean }> {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    if (auth.role !== UserRole.ADMIN) {
      return { success: false };
    }
    const job = await this.dlq.getJob(body.jobId);
    if (!job?.data) {
      return { success: false };
    }
    await this.mainQueue.add('run-node', job.data, {
      jobId: pipelineNodeReplayJobId(job.data.pipelineId, job.data.nodeId),
    });
    await job.remove();
    return { success: true };
  }
}
