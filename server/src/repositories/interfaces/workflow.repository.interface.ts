import type { Prisma, WorkflowStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowRecord } from '../../domain/workflow/workflow.types';

export interface IWorkflowRepository {
  findById(
    workflowId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowRecord | null>;
  findLatestByRule(
    ruleRef: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowRecord | null>;
  findLatestReadyByRule(ruleRef: string): Promise<WorkflowRecord | null>;
  findTemplateById(workflowId: string): Promise<WorkflowRecord | null>;
  findReadyById(workflowId: string): Promise<WorkflowRecord | null>;
  listTemplates(auth?: TenancyAuth): Promise<WorkflowRecord[]>;
  findPage(
    filter: Prisma.WorkflowWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: WorkflowRecord[]; total: number }>;
  count(where: Prisma.WorkflowWhereInput): Promise<number>;
  create(data: Prisma.WorkflowCreateInput): Promise<WorkflowRecord>;
  updateById(
    workflowId: string,
    data: Prisma.WorkflowUpdateInput,
    auth?: TenancyAuth,
  ): Promise<void>;
  updateStatus(
    workflowId: string,
    status: WorkflowStatus,
    auth?: TenancyAuth,
  ): Promise<void>;
  appendVersion(
    workflowId: string,
    versionEntry: unknown,
    patch: Prisma.WorkflowUpdateInput,
    auth?: TenancyAuth,
  ): Promise<void>;
  archiveTemplate(workflowId: string): Promise<WorkflowRecord | null>;
}
