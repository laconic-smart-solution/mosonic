import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import { mergeTenancyWhere } from '../../repositories/prisma/prisma.util';
import { PipelineStatus } from '../../pipeline/schemas/pipeline.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import { toolError } from './tool-error.util';

const PROMPT_LIMIT = 160;

export type ScopedWorkflow = {
  workflowId: string;
  name: string;
  status: string;
};

export type ScopedPipelineRow = {
  pipelineId: string;
  workflowId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  contentPrompt: string;
};

export function truncatePrompt(value: string): string {
  const prompt = value.trim();
  if (prompt.length <= PROMPT_LIMIT) return prompt;
  return `${prompt.slice(0, PROMPT_LIMIT)}…`;
}

export async function resolveWorkflowForSession(
  workflowService: WorkflowService,
  ruleId: string,
  auth: TenancyAuth,
  workflowId?: string,
): Promise<{ ok: true; workflow: ScopedWorkflow } | { ok: false; observation: string }> {
  const requested = workflowId?.trim();
  if (requested) {
    try {
      const snapshot = await workflowService.getWorkflow(requested, auth);
      if (snapshot.workflow.ruleRef !== ruleId) {
        return {
          ok: false,
          observation: toolError('not_found', 'Workflow not found for this brand.'),
        };
      }
      return {
        ok: true,
        workflow: {
          workflowId: snapshot.workflow.workflowId,
          name: snapshot.workflow.name,
          status: String(snapshot.workflow.status),
        },
      };
    } catch {
      return {
        ok: false,
        observation: toolError('not_found', 'Workflow not found for this brand.'),
      };
    }
  }

  const latest = await workflowService.getWorkflowByRuleId(ruleId, auth);
  if (!latest || latest.workflow.ruleRef !== ruleId) {
    return {
      ok: false,
      observation: toolError(
        'no_workflow',
        'This brand has no workflow yet. Create one before checking pipelines. Offer to set up the default workflow with ask_user (Yes / Not now); do not mention the canvas or drafts.',
      ),
    };
  }
  return {
    ok: true,
    workflow: {
      workflowId: latest.workflow.workflowId,
      name: latest.workflow.name,
      status: String(latest.workflow.status),
    },
  };
}

export async function listPipelinesForWorkflow(
  pipelines: IPipelineRepository,
  workflowId: string,
  auth: TenancyAuth,
  status?: (typeof PipelineStatus)[keyof typeof PipelineStatus],
): Promise<ScopedPipelineRow[]> {
  const filter = mergeTenancyWhere(
    {
      workflowRef: workflowId,
      ...(status ? { status } : {}),
    } as Prisma.PipelineWhereInput,
    auth,
  );
  const { rows } = await pipelines.findPage(
    filter,
    1,
    10,
    'startedAt',
    'desc',
  );
  return rows
    .filter((row) => row.workflowRef === workflowId)
    .map((row) => ({
      pipelineId: row.pipelineId,
      workflowId: row.workflowRef,
      status: String(row.status),
      startedAt: new Date(row.startedAt ?? Date.now()).toISOString(),
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      contentPrompt: truncatePrompt(row.contentPrompt ?? ''),
    }));
}

export function pickActivePipeline(
  rows: ScopedPipelineRow[],
): ScopedPipelineRow | null {
  return (
    rows.find((row) => row.status === PipelineStatus.Running || row.status === 'running') ??
    rows.find((row) => row.status === PipelineStatus.Paused || row.status === 'paused') ??
    null
  );
}

export function assertPipelineOnWorkflow(args: {
  pipelineRuleRef: string;
  pipelineWorkflowRef: string;
  ruleId: string;
  workflowId: string;
}): string | null {
  if (
    args.pipelineRuleRef !== args.ruleId ||
    args.pipelineWorkflowRef !== args.workflowId
  ) {
    return toolError('not_found', 'Pipeline not found for this workflow.');
  }
  return null;
}
