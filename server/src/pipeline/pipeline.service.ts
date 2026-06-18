import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { OrchestrationService } from '../orchestration/orchestration.service';
import type {
  PipelinePageItemDto,
  PipelinePageQueryDto,
} from './dto/pipeline-page-query.dto';
import {
  Pipeline,
  PipelineStatus,
  type PipelineDocument,
} from './schemas/pipeline.schema';
import { defaultPipelineName } from './pipeline-name.util';
import type {
  UpdatePipelineDto,
  UpdatePipelineResponseDto,
} from './dto/update-pipeline.dto';

function uniquePipelineNodeTypes(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const types = new Set<string>();
  for (const row of nodes) {
    const type =
      row && typeof row === 'object' && 'type' in row
        ? String((row as { type?: unknown }).type ?? '').trim()
        : '';
    if (type) types.add(type);
  }
  return Array.from(types);
}

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
    if (dto.filter?.status) {
      filter.status = dto.filter.status;
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
          name: 1,
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
      name:
        doc.name?.trim() ||
        defaultPipelineName(doc.contentPrompt, new Date(doc.startedAt ?? Date.now())),
      contentPrompt: doc.contentPrompt,
      nodeCount: Array.isArray(doc.nodes) ? doc.nodes.length : 0,
      nodeTypes: uniquePipelineNodeTypes(doc.nodes),
      startedAt: new Date(doc.startedAt ?? new Date()).toISOString(),
      completedAt: doc.completedAt
        ? new Date(doc.completedAt).toISOString()
        : null,
      metadataSource: doc.metadata?.source,
      newsTitle: doc.metadata?.newsMeta?.title,
    }));

    return { data, total };
  }

  async getPipelineStats(
    auth: TenancyAuth,
    workflowRef?: string,
  ): Promise<{
    total: number;
    byStatus: Partial<Record<PipelineStatus, number>>;
  }> {
    const scoped: Record<string, unknown> = mergeUserIdFilter({}, auth);
    if (workflowRef?.trim()) {
      scoped.workflowRef = workflowRef.trim();
    }

    const agg = await this.pipelineModel
      .aggregate<{ _id: PipelineStatus | null; count: number }>([
        { $match: scoped },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();

    const byStatus: Partial<Record<PipelineStatus, number>> = {};
    let total = 0;
    const knownStatuses = new Set<string>(Object.values(PipelineStatus));
    for (const row of agg) {
      total += row.count;
      if (row._id == null) continue;
      const key = String(row._id);
      if (knownStatuses.has(key)) {
        byStatus[key as PipelineStatus] = row.count;
      }
    }
    return { total, byStatus };
  }

  startPipeline(args: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
    useLearnings?: boolean;
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    return this.orchestration.startPipeline(args);
  }

  async retryNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    await this.orchestration.retryNode(pipelineId, nodeId, auth);
    return { success: true };
  }

  async skipNode(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ): Promise<{ success: boolean }> {
    await this.orchestration.skipNode(pipelineId, nodeId, auth);
    return { success: true };
  }

  getPipeline(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.getPipeline(pipelineId, auth);
  }

  tryFinalizePipeline(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.tryFinalizePipeline(pipelineId, auth);
  }

  replanPipeline(
    pipelineId: string,
    operations: Parameters<OrchestrationService['replanPipeline']>[1],
    auth: TenancyAuth,
  ) {
    return this.orchestration.replanPipeline(pipelineId, operations, auth);
  }

  cancelPipeline(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.cancelPipeline(pipelineId, auth);
  }

  resumeLane(pipelineId: string, laneId: string, auth: TenancyAuth) {
    return this.orchestration.resumeLane(pipelineId, laneId, auth);
  }

  skipLane(pipelineId: string, laneId: string, auth: TenancyAuth) {
    return this.orchestration.skipLane(pipelineId, laneId, auth);
  }

  getPipelineRunSummary(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.getPipelineRunSummary(pipelineId, auth);
  }

  getPipelineTimeline(pipelineId: string, auth: TenancyAuth) {
    return this.orchestration.getPipelineTimeline(pipelineId, auth);
  }

  async updateName(
    pipelineId: string,
    dto: UpdatePipelineDto,
    auth: TenancyAuth,
  ): Promise<UpdatePipelineResponseDto> {
    const name = dto.name.trim();
    const pipeline = await this.pipelineModel
      .findOneAndUpdate(
        mergeUserIdFilter({ pipelineId }, auth),
        { $set: { name } },
        { new: true },
      )
      .select({ pipelineId: 1, name: 1 })
      .lean()
      .exec();
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return { pipelineId: pipeline.pipelineId, name: pipeline.name };
  }
}
