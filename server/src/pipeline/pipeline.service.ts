import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { OrchestrationService } from '../orchestration/orchestration.service';
import type {
  PipelinePageItemDto,
  PipelinePageQueryDto,
} from './dto/pipeline-page-query.dto';
import { Pipeline, type PipelineDocument } from './schemas/pipeline.schema';

@Injectable()
export class PipelineService {
  constructor(
    private readonly orchestration: OrchestrationService,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
  ) {}

  async findPage(
    dto: PipelinePageQueryDto,
    auth: TenancyAuth,
  ): Promise<{
    data: PipelinePageItemDto[];
    total: number;
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const sortBy = dto.sortBy ?? 'startedAt';
    const sortOrder = dto.sortOrder ?? 'desc';
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = mergeUserIdFilter({}, auth);
    if (dto.filter?.workflowRef) {
      filter.workflowRef = dto.filter.workflowRef;
    }

    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir };

    const [docs, total] = await Promise.all([
      this.pipelineModel
        .find(filter)
        .select({
          pipelineId: 1,
          workflowRef: 1,
          ruleRef: 1,
          status: 1,
          contentPrompt: 1,
          startedAt: 1,
          completedAt: 1,
          nodes: 1,
        })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.pipelineModel.countDocuments(filter).exec(),
    ]);

    const data: PipelinePageItemDto[] = docs.map((doc) => ({
      pipelineId: doc.pipelineId,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status,
      contentPrompt: doc.contentPrompt,
      nodeCount: Array.isArray(doc.nodes) ? doc.nodes.length : 0,
      startedAt: new Date(doc.startedAt ?? new Date()).toISOString(),
      completedAt: doc.completedAt
        ? new Date(doc.completedAt).toISOString()
        : null,
    }));

    return { data, total };
  }

  startPipeline(args: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    return this.orchestration.startPipeline(args);
  }

  async retryNode(
    pipelineId: string,
    _nodeId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    await this.orchestration.retryNode(pipelineId, auth);
    return { success: true };
  }

  getPipeline(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.getPipeline(pipelineId, auth);
  }
}
