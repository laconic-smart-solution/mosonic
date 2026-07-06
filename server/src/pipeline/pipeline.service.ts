import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeTenancyWhere } from '../repositories/prisma/prisma.util';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import { PIPELINE_REPOSITORY } from '../repositories/tokens';
import { OrchestrationService } from '../orchestration/orchestration.service';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import { RULE_REPOSITORY } from '../repositories/tokens';
import type {
  PipelinePageItemDto,
  PipelinePageQueryDto,
} from './dto/pipeline-page-query.dto';
import type { EstimatePipelineDto } from './dto/estimate-pipeline.dto';
import { PipelineStatus } from './schemas/pipeline.schema';
import { defaultPipelineName } from './pipeline-name.util';
import type {
  UpdatePipelineDto,
  UpdatePipelineResponseDto,
} from './dto/update-pipeline.dto';
import { parsePipelineNodes } from '../repositories/prisma/pipeline-nodes.util';

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
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
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

    const filter: Prisma.PipelineWhereInput = mergeTenancyWhere({}, auth);
    if (dto.filter?.workflowRef) {
      filter.workflowRef = dto.filter.workflowRef;
    }
    if (dto.filter?.status) {
      filter.status = dto.filter.status as Prisma.EnumPipelineStatusFilter['equals'];
    }

    const { rows: docs, total } = await this.pipelines.findPage(
      filter,
      page,
      limit,
      sortBy,
      sortOrder,
    );

    const ruleIds = [
      ...new Set(
        docs
          .map((doc) => String(doc.ruleRef ?? '').trim())
          .filter((id) => id.length > 0),
      ),
    ];
    const ruleNameById = new Map<string, string>();
    if (ruleIds.length > 0) {
      const rules = await this.rules.findByIds(ruleIds);
      for (const rule of rules) {
        const name = rule.name?.trim();
        if (name) ruleNameById.set(rule.ruleId, name);
      }
    }

    const data: PipelinePageItemDto[] = docs.map((doc) => {
      const nodes = parsePipelineNodes(doc.nodes);
      return {
        pipelineId: doc.pipelineId,
        workflowRef: doc.workflowRef,
        ruleRef: doc.ruleRef,
        status: doc.status as PipelineStatus,
        name:
          doc.name?.trim() ||
          defaultPipelineName(doc.contentPrompt, new Date(doc.startedAt ?? Date.now())),
        contentPrompt: doc.contentPrompt,
        nodeCount: nodes.length,
        nodeTypes: uniquePipelineNodeTypes(nodes),
        startedAt: new Date(doc.startedAt ?? new Date()).toISOString(),
        completedAt: doc.completedAt
          ? new Date(doc.completedAt).toISOString()
          : null,
        metadataSource: (doc.metadata as { source?: string } | null)?.source,
        newsTitle: (doc.metadata as { newsMeta?: { title?: string } } | null)
          ?.newsMeta?.title,
        ruleName: ruleNameById.get(doc.ruleRef),
      };
    });

    return { data, total };
  }

  async getPipelineStats(
    auth: TenancyAuth,
    workflowRef?: string,
  ): Promise<{
    total: number;
    byStatus: Partial<Record<PipelineStatus, number>>;
  }> {
    const scoped: Prisma.PipelineWhereInput = mergeTenancyWhere({}, auth);
    if (workflowRef?.trim()) {
      scoped.workflowRef = workflowRef.trim();
    }

    const byStatusRaw = await this.pipelines.aggregateStatusCounts(scoped);
    const byStatus: Partial<Record<PipelineStatus, number>> = {};
    let total = 0;
    for (const [status, count] of Object.entries(byStatusRaw)) {
      total += count ?? 0;
      byStatus[status as PipelineStatus] = count;
    }
    return { total, byStatus };
  }

  startPipeline(args: {
    workflowId: string;
    ruleId: string;
    contentPrompt: string;
    useLearnings?: boolean;
    executionMode?: 'auto' | 'step';
    reviewNodeIds?: string[];
    auth: TenancyAuth;
  }): Promise<{ pipelineId: string }> {
    return this.orchestration.startPipeline(args);
  }

  estimateReviewRegenerate(
    pipelineId: string,
    nodeId: string,
    auth: TenancyAuth,
  ) {
    return this.orchestration.estimateReviewRegenerateCredits(
      pipelineId,
      nodeId,
      auth,
    );
  }

  reviewNode(
    pipelineId: string,
    nodeId: string,
    dto: {
      action: 'continue' | 'edit' | 'regenerate';
      editedContent?: string;
      regenerateInstruction?: string;
      mediaUrl?: string;
    },
    auth: TenancyAuth,
  ): Promise<{ success: boolean; noop?: boolean }> {
    return this.orchestration.reviewNode(pipelineId, nodeId, dto, auth);
  }

  estimatePipeline(dto: EstimatePipelineDto, auth: TenancyAuth) {
    return this.orchestration.estimatePipelineCredits({
      workflowId: dto.workflowId,
      ruleId: dto.ruleId,
      auth,
    });
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
    const pipeline = await this.pipelines.updateById(
      pipelineId,
      { name },
      auth,
    );
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    return { pipelineId: pipeline.pipelineId, name: pipeline.name ?? name };
  }
}
