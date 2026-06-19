import type { Prisma, WorkflowNodeType } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowNodeRecord } from '../../domain/workflow/workflow.types';

export interface IWorkflowNodeRepository {
  findByWorkflow(
    workflowRef: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord[]>;
  findByWorkflowRefs(
    workflowRefs: string[],
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord[]>;
  findByWorkflowAndNodeId(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null>;
  findVideoNode(
    workflowRef: string,
    nodeId: string,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord | null>;
  countByWorkflow(workflowRef: string, auth?: TenancyAuth): Promise<number>;
  distinctWorkflowRefsByType(
    type: WorkflowNodeType,
    auth?: TenancyAuth,
  ): Promise<string[]>;
  create(data: Prisma.WorkflowNodeCreateInput): Promise<WorkflowNodeRecord>;
  createMany(
    data: Prisma.WorkflowNodeCreateManyInput[],
  ): Promise<WorkflowNodeRecord[]>;
  upsertNode(
    workflowRef: string,
    nodeId: string,
    data: Prisma.WorkflowNodeCreateInput,
    auth?: TenancyAuth,
  ): Promise<WorkflowNodeRecord>;
  updateConfig(
    workflowRef: string,
    nodeId: string,
    config: Prisma.InputJsonValue,
    auth?: TenancyAuth,
  ): Promise<void>;
  deleteExcept(
    workflowRef: string,
    keepNodeIds: string[],
    auth?: TenancyAuth,
  ): Promise<void>;
  deleteByWorkflow(workflowRef: string, auth?: TenancyAuth): Promise<void>;
}
