import { Injectable } from '@nestjs/common';
import type { Prisma, WorkflowStatus } from '@prisma/client';
import { UserRole } from '../../domain/users/user.types';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { WorkflowRecord } from '../../domain/workflow/workflow.types';
import type { IWorkflowRepository } from '../interfaces/workflow.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaWorkflowRepository implements IWorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    workflowId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowRecord | null> {
    if (!auth || auth.role === UserRole.ADMIN) {
      return this.prisma.workflow.findFirst({ where: { workflowId } });
    }
    return this.prisma.workflow.findFirst({
      where: {
        workflowId,
        OR: [{ userId: auth.userId }, { userId: null }, { isTemplate: true }],
      },
    });
  }

  async findLatestByRule(
    ruleRef: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowRecord | null> {
    if (!auth || auth.role === UserRole.ADMIN) {
      return this.prisma.workflow.findFirst({
        where: { ruleRef },
        orderBy: { createdAt: 'desc' },
      });
    }

    // 1. Try finding user's own workflow for this rule
    const userWorkflow = await this.prisma.workflow.findFirst({
      where: { ruleRef, userId: auth.userId },
      orderBy: { createdAt: 'desc' },
    });
    if (userWorkflow) {
      return userWorkflow;
    }

    // 2. Fall back to any system/template or unowned ready workflow on this rule
    return this.prisma.workflow.findFirst({
      where: {
        ruleRef,
        OR: [{ userId: null }, { isTemplate: true }, { status: 'ready' }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findLatestReadyByRule(ruleRef: string): Promise<WorkflowRecord | null> {
    return this.prisma.workflow.findFirst({
      where: { ruleRef, status: 'ready' },
      orderBy: { createdAt: 'desc' },
    });
  }

  findTemplateById(workflowId: string): Promise<WorkflowRecord | null> {
    return this.prisma.workflow.findFirst({
      where: { workflowId, isTemplate: true },
    });
  }

  findReadyById(workflowId: string): Promise<WorkflowRecord | null> {
    return this.prisma.workflow.findFirst({
      where: { workflowId, status: 'ready' },
    });
  }

  listTemplates(auth?: TenancyAuth): Promise<WorkflowRecord[]> {
    const where = auth
      ? mergeTenancyWhere({ isTemplate: true }, auth)
      : { isTemplate: true };
    return this.prisma.workflow.findMany({ where });
  }

  async findPage(
    filter: Prisma.WorkflowWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: WorkflowRecord[]; total: number }> {
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.WorkflowOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      this.prisma.workflow.findMany({
        where: filter,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          workflowId: true,
          ruleRef: true,
          name: true,
          status: true,
          updatedAt: true,
          userId: true,
          nodes: true,
          edges: true,
          isTemplate: true,
          templateName: true,
          version: true,
          versions: true,
          createdAt: true,
        },
      }),
      this.prisma.workflow.count({ where: filter }),
    ]);
    return { rows: rows, total };
  }

  count(where: Prisma.WorkflowWhereInput): Promise<number> {
    return this.prisma.workflow.count({ where });
  }

  create(data: Prisma.WorkflowCreateInput): Promise<WorkflowRecord> {
    return this.prisma.workflow.create({ data });
  }

  updateById(
    workflowId: string,
    data: Prisma.WorkflowUpdateInput,
    auth?: TenancyAuth,
  ): Promise<void> {
    const where = auth
      ? mergeTenancyWhere({ workflowId }, auth)
      : { workflowId };
    return this.prisma.workflow
      .updateMany({ where, data })
      .then(() => undefined);
  }

  updateStatus(
    workflowId: string,
    status: WorkflowStatus,
    auth?: TenancyAuth,
  ): Promise<void> {
    return this.updateById(workflowId, { status }, auth);
  }

  async appendVersion(
    workflowId: string,
    versionEntry: unknown,
    patch: Prisma.WorkflowUpdateInput,
    auth?: TenancyAuth,
  ): Promise<void> {
    const workflow = await this.findById(workflowId, auth);
    if (!workflow) return;
    const versions = Array.isArray(workflow.versions)
      ? [...(workflow.versions as unknown[]), versionEntry]
      : [versionEntry];
    await this.updateById(
      workflowId,
      { ...patch, versions: versions as Prisma.InputJsonValue },
      auth,
    );
  }

  async archiveTemplate(workflowId: string): Promise<WorkflowRecord | null> {
    try {
      return await this.prisma.workflow.update({
        where: { workflowId },
        data: { status: 'archived' },
      });
    } catch {
      return null;
    }
  }
}
