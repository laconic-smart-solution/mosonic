import { Injectable } from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { UserRole } from '../../domain/users/user.types';
import { flattenNodeOutputsBestEffort } from '../../content/content-node-output.util';
import { mergeResolvedOutputs } from '../../content/content-output.utils';
import { buildNodeOutputMapFromPipeline } from '../../pipeline/pipeline-output-parse';
import type {
  ContentPageItemDto,
  ContentPageQueryDto,
} from '../../content/dto/content-page-query.dto';
import { ContentStatus as SchemaContentStatus } from '../../content/schemas/content.schema';
import { PrismaService } from '../../database/prisma.service';
import type {
  ContentOutputs,
  ContentRecord,
  ContentUserEdits,
} from '../../domain/content/content.types';
import type { IContentRepository } from '../interfaces/content.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

type PageDocLean = {
  contentId: string;
  pipelineRef: string;
  workflowRef: string;
  ruleRef: string;
  status: ContentStatus;
  createdAt: Date;
  updatedAt: Date;
  outputs: unknown;
  userEdits: unknown;
  nodeOutputs: unknown;
  nodeUserEdits: unknown;
  laneOutputs: unknown;
};

@Injectable()
export class PrismaContentRepository implements IContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null> {
    return this.prisma.content.findFirst({
      where: mergeTenancyWhere({ contentId }, auth),
    });
  }

  findByIdLean(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null> {
    return this.findById(contentId, auth);
  }

  findByContentId(contentId: string): Promise<ContentRecord | null> {
    return this.prisma.content.findUnique({ where: { contentId } });
  }

  findLatestByPipeline(
    pipelineRef: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null> {
    return this.prisma.content.findFirst({
      where: mergeTenancyWhere({ pipelineRef }, auth),
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.ContentCreateInput): Promise<ContentRecord> {
    return this.prisma.content.create({ data });
  }

  async findPage(
    query: ContentPageQueryDto,
    auth: TenancyAuth,
  ): Promise<{ data: ContentPageItemDto[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: Prisma.ContentWhereInput = mergeTenancyWhere({}, auth);
    if (query.filter?.workflowRef) where.workflowRef = query.filter.workflowRef;
    if (query.filter?.ruleRef) where.ruleRef = query.filter.ruleRef;
    if (query.filter?.pipelineRef) where.pipelineRef = query.filter.pipelineRef;
    if (query.filter?.status) where.status = query.filter.status;

    const andClauses: Prisma.ContentWhereInput[] = [];
    if (query.filter?.hasImage === true) {
      andClauses.push(mediaFieldOrClause('image'));
    }
    if (query.filter?.hasVideo === true) {
      andClauses.push(mediaFieldOrClause('video'));
    }
    if (query.filter?.hasSummary === true) {
      andClauses.push(mediaFieldOrClause('summary'));
    }

    const searchTrim = query.search?.trim();
    if (searchTrim) {
      andClauses.push({
        OR: [
          { contentId: { contains: searchTrim, mode: 'insensitive' } },
          { ruleRef: { contains: searchTrim, mode: 'insensitive' } },
          { workflowRef: { contains: searchTrim, mode: 'insensitive' } },
          { pipelineRef: { contains: searchTrim, mode: 'insensitive' } },
        ],
      });
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const orderBy = { [sortBy]: sortOrder } as Prisma.ContentOrderByWithRelationInput;

    const [docs, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          contentId: true,
          pipelineRef: true,
          workflowRef: true,
          ruleRef: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          outputs: true,
          userEdits: true,
          nodeOutputs: true,
          nodeUserEdits: true,
          laneOutputs: true,
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    const pageDocs = docs as PageDocLean[];
    const pipelineRefs = [
      ...new Set(pageDocs.map((d) => d.pipelineRef).filter(Boolean)),
    ];
    const pipelineById = await this.loadPipelineNodes(pipelineRefs, auth);

    return {
      data: pageDocs.map((doc) => this.toPageItem(doc, pipelineById)),
      total,
    };
  }

  private async loadPipelineNodes(
    pipelineRefs: string[],
    auth: TenancyAuth,
  ): Promise<Map<string, { nodes: unknown }>> {
    const out = new Map<string, { nodes: unknown }>();
    if (pipelineRefs.length === 0) return out;

    const where: Prisma.PipelineWhereInput = {
      pipelineId: { in: pipelineRefs },
    };
    if (auth.role !== UserRole.ADMIN) {
      where.OR = [{ userId: auth.userId }, { userId: null }];
    }

    const pipelines = await this.prisma.pipeline.findMany({
      where,
      select: { pipelineId: true, nodes: true },
    });

    for (const p of pipelines) {
      out.set(p.pipelineId, { nodes: p.nodes });
    }
    return out;
  }

  private pipelineNodesOrdered(
    nodes: unknown,
  ): Array<{ nodeId: string; type: string; order: number }> {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((raw) => {
      const n = raw as { nodeId?: string; type?: string; order?: number };
      return {
        nodeId: String(n.nodeId ?? ''),
        type: String(n.type ?? ''),
        order: n.order ?? 0,
      };
    });
  }

  private toPageItem(
    doc: PageDocLean,
    pipelineById: Map<string, { nodes: unknown }>,
  ): ContentPageItemDto {
    const pipeline = pipelineById.get(doc.pipelineRef);
    const rawNodes = pipeline?.nodes;
    const pipelineNodesOrdered = this.pipelineNodesOrdered(rawNodes);
    const nodeOutputs = {
      ...buildNodeOutputMapFromPipeline(rawNodes),
      ...((doc.nodeOutputs ?? {}) as Record<string, Record<string, unknown>>),
    };
    const laneOutputs = (doc.laneOutputs ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const hasLaneOutputs = Object.keys(laneOutputs).length > 0;

    const merged = mergeResolvedOutputs(
      {
        outputs: doc.outputs as ContentOutputs,
        userEdits: doc.userEdits as ContentUserEdits,
        nodeOutputs,
        nodeUserEdits: doc.nodeUserEdits as Record<
          string,
          Record<string, unknown>
        >,
      },
      pipelineNodesOrdered.length > 0
        ? { pipelineNodesOrdered }
        : undefined,
    );

    let outputs = merged;
    if (
      pipelineNodesOrdered.length === 0 &&
      Object.keys(nodeOutputs).length > 0
    ) {
      outputs = {
        ...merged,
        ...flattenNodeOutputsBestEffort(
          nodeOutputs,
          (doc.nodeUserEdits ?? {}) as Record<string, Record<string, unknown>>,
        ),
      };
    }

    return {
      contentId: doc.contentId,
      pipelineRef: doc.pipelineRef,
      workflowRef: doc.workflowRef,
      ruleRef: doc.ruleRef,
      status: doc.status as SchemaContentStatus,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      outputs,
      ...(hasLaneOutputs ? { laneOutputs } : {}),
    };
  }

  async getStats(auth: TenancyAuth): Promise<{
    total: number;
    byStatus: Partial<Record<ContentStatus, number>>;
  }> {
    const where = mergeTenancyWhere({}, auth);
    const rows = await this.prisma.content.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus: Partial<Record<ContentStatus, number>> = {};
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      byStatus[row.status] = row._count._all;
    }
    return { total, byStatus };
  }

  async updateEditableState(
    contentId: string,
    payload: {
      outputs?: ContentOutputs;
      userEdits?: ContentUserEdits;
      nodePromptOverrides?: Record<string, string>;
      nodeOutputs?: Record<string, Record<string, unknown>>;
      nodeUserEdits?: Record<string, Record<string, unknown>>;
    },
    auth: TenancyAuth,
  ): Promise<{ matchedCount: number }> {
    const result = await this.prisma.content.updateMany({
      where: mergeTenancyWhere({ contentId }, auth),
      data: payload as Prisma.ContentUpdateManyMutationInput,
    });
    return { matchedCount: result.count };
  }

  updateStatus(
    contentId: string,
    status: ContentStatus,
    auth: TenancyAuth,
  ): Promise<void> {
    return this.prisma.content
      .updateMany({
        where: mergeTenancyWhere({ contentId }, auth),
        data: { status },
      })
      .then(() => undefined);
  }

  countDrafts(auth: TenancyAuth): Promise<number> {
    return this.prisma.content.count({
      where: mergeTenancyWhere({ status: 'draft' as ContentStatus }, auth),
    });
  }

  countSince(createdAtGte: Date): Promise<number> {
    return this.prisma.content.count({
      where: { createdAt: { gte: createdAtGte } },
    });
  }

  findRecent(auth: TenancyAuth, limit: number): Promise<ContentRecord[]> {
    return this.prisma.content.findMany({
      where: mergeTenancyWhere({}, auth),
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async findPageAdmin(
    filter: Prisma.ContentWhereInput,
    page: number,
    limit: number,
  ): Promise<{ rows: ContentRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.content.findMany({
        where: filter,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.content.count({ where: filter }),
    ]);
    return { rows, total };
  }
}

function mediaFieldOrClause(
  field: 'image' | 'video' | 'summary',
): Prisma.ContentWhereInput {
  const nonEmpty = (path: string[]): Prisma.ContentWhereInput => ({
    OR: [
      {
        outputs: {
          path,
          not: Prisma.DbNull,
        },
      },
    ],
  });
  return {
    OR: [
      {
        outputs: {
          path: [field],
          string_contains: ' ',
        },
      },
      {
        userEdits: {
          path: [field],
          string_contains: ' ',
        },
      },
      nonEmpty(['outputs', field]),
      nonEmpty(['userEdits', field]),
    ],
  };
}
