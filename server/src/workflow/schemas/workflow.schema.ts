import { WorkflowStatus as PrismaWorkflowStatus } from '@prisma/client';
import type { WorkflowEdgeEntry } from './workflow-edge.schema';

export const WorkflowStatus = {
  ...PrismaWorkflowStatus,
  Generating: PrismaWorkflowStatus.generating,
  Ready: PrismaWorkflowStatus.ready,
  Failed: PrismaWorkflowStatus.failed,
  Archived: PrismaWorkflowStatus.archived,
} as const;

export type WorkflowStatus =
  (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export interface WorkflowVersionEntry {
  versionNumber: number;
  nodes: string[];
  edges: WorkflowEdgeEntry[];
  createdAt: Date;
}

export interface Workflow {
  workflowId: string;
  userId?: string;
  ruleRef: string;
  name: string;
  nodes: string[];
  edges: WorkflowEdgeEntry[];
  isTemplate: boolean;
  templateName: string | null;
  version: number;
  versions: WorkflowVersionEntry[];
  status: WorkflowStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WorkflowDocument = Workflow;
