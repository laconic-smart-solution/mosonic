import { Injectable } from '@nestjs/common';
import type { Prisma, WorkflowNodeType } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { WorkflowNodeRecord } from '../../domain/workflow/workflow.types';
import type { IWorkflowNodeRepository } from '../interfaces/workflow-node.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaWorkflowNodeRepository implements IWorkflowNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByWorkflow(
    workflowRef: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord[]> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef }, auth)
      : { workflowRef };
    return this.prisma.workflowNode.findMany({
      where,
      orderBy: { order: 'asc' },
    });
  }

  findByWorkflowRefs(
    workflowRefs: string[],
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord[]> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef: { in: workflowRefs } }, auth)
      : { workflowRef: { in: workflowRefs } };
    return this.prisma.workflowNode.findMany({ where });
  }

  findByWorkflowAndNodeId(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef, nodeId }, auth)
      : { workflowRef, nodeId };
    return this.prisma.workflowNode.findFirst({ where });
  }

  findVideoNode(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null> {
    const where = auth
      ? mergeTenancyWhere(
          { workflowRef, nodeId, type: 'video_generation' as const },
          auth,
        )
      : { workflowRef, nodeId, type: 'video_generation' as const };
    return this.prisma.workflowNode.findFirst({ where });
  }

  countByWorkflow(workflowRef: string, auth?: TenancyAuth): Promise<number> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef }, auth)
      : { workflowRef };
    return this.prisma.workflowNode.count({ where });
  }

  async distinctWorkflowRefsByType(
    type: WorkflowNodeType,
    auth?: TenancyAuth,
  ): Promise<string[]> {
    const where = auth
      ? mergeTenancyWhere({ type }, auth)
      : { type };
    const rows = await this.prisma.workflowNode.findMany({
      where,
      select: { workflowRef: true },
      distinct: ['workflowRef'],
    });
    return rows.map((r) => r.workflowRef);
  }

  create(data: Prisma.WorkflowNodeCreateInput): Promise<WorkflowNodeRecord> {
    return this.prisma.workflowNode.create({ data });
  }

  async createMany(
    data: Prisma.WorkflowNodeCreateManyInput[],
  ): Promise<WorkflowNodeRecord[]> {
    await this.prisma.workflowNode.createMany({ data });
    if (data.length === 0) return [];
    return this.prisma.workflowNode.findMany({
      where: {
        workflowRef: data[0]!.workflowRef,
        nodeId: { in: data.map((d) => d.nodeId).filter(Boolean) as string[] },
      },
    });
  }

  async upsertNode(
    workflowRef: string,
    nodeId: string,
    data: Prisma.WorkflowNodeCreateInput,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord> {
    const existing = await this.findByWorkflowAndNodeId(
      workflowRef,
      nodeId,
      auth,
    );
    if (existing) {
      return this.prisma.workflowNode.update({
        where: { nodeId },
        data: {
          type: data.type,
          order: data.order,
          isLocked: data.isLocked,
          userPrompt: data.userPrompt,
          config: data.config,
          lane: data.lane,
          x: data.x,
          y: data.y,
          userId: data.userId,
        },
      });
    }
    return this.prisma.workflowNode.create({ data });
  }

  updateConfig(
    workflowRef: string,
    nodeId: string,
    config: Prisma.InputJsonValue,
    auth?: TenancyAuth,
  ): Promise<void> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef, nodeId }, auth)
      : { workflowRef, nodeId };
    return this.prisma.workflowNode
      .updateMany({ where, data: { config } })
      .then(() => undefined);
  }

  deleteExcept(
    workflowRef: string,
    keepNodeIds: string[],
    auth?: TenancyAuth,
  ): Promise<void> {
    const where = auth
      ? mergeTenancyWhere(
          { workflowRef, nodeId: { notIn: keepNodeIds } },
          auth,
        )
      : { workflowRef, nodeId: { notIn: keepNodeIds } };
    return this.prisma.workflowNode
      .deleteMany({ where })
      .then(() => undefined);
  }

  deleteByWorkflow(workflowRef: string, auth?: TenancyAuth): Promise<void> {
    const where = auth
      ? mergeTenancyWhere({ workflowRef }, auth)
      : { workflowRef };
    return this.prisma.workflowNode
      .deleteMany({ where })
      .then(() => undefined);
  }
}
