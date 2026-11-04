import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError, toolOk } from './tool-error.util';
import {
  assertPipelineOnWorkflow,
  listPipelinesForWorkflow,
  pickActivePipeline,
  resolveWorkflowForSession,
  truncatePrompt,
} from './pipeline-scope.util';

const GET_PIPELINE_STATUS_SCHEMA = z.object({
  pipelineId: z
    .string()
    .optional()
    .describe(
      'Pipeline id. Omit to use the active run on this workflow, or the latest run if none is active.',
    ),
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to inspect. Omit to use the latest workflow for this brand.'),
});

type PipelineSnapshot = Awaited<
  ReturnType<OrchestrationService['getPipeline']>
>;

export function formatPipelineStatus(
  snapshot: PipelineSnapshot,
  ruleId: string,
  workflowId: string,
): string {
  const scoped = assertPipelineOnWorkflow({
    pipelineRuleRef: snapshot.pipeline.ruleRef,
    pipelineWorkflowRef: snapshot.pipeline.workflowRef,
    ruleId,
    workflowId,
  });
  if (scoped) return scoped;

  const nodes = [...snapshot.nodes]
    .sort((a, b) => a.order - b.order)
    .map((node) => ({
      nodeId: node.nodeId,
      type: String(node.type),
      order: node.order,
      lane: node.lane ?? null,
      status: String(node.status),
      retryCount: node.retryCount ?? 0,
    }));
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    counts[node.status] = (counts[node.status] ?? 0) + 1;
  }

  return toolOk({
    action: 'pipeline_status',
    pipelineId: snapshot.pipeline.pipelineId,
    workflowId: snapshot.pipeline.workflowRef,
    status: String(snapshot.pipeline.status),
    pausedNodeId: snapshot.pipeline.pausedNodeId,
    contentPrompt: truncatePrompt(snapshot.pipeline.contentPrompt ?? ''),
    counts,
    nodes,
  });
}

export function createGetPipelineStatusTool(
  ruleId: string,
  workflowService: WorkflowService,
  pipelines: IPipelineRepository,
  orchestration: OrchestrationService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ pipelineId, workflowId }) =>
      runTool(async () => {
        const scoped = await resolveWorkflowForSession(
          workflowService,
          ruleId,
          auth,
          workflowId,
        );
        if (!scoped.ok) return scoped.observation;

        let id = pipelineId?.trim() ?? '';
        if (!id) {
          const rows = await listPipelinesForWorkflow(
            pipelines,
            scoped.workflow.workflowId,
            auth,
          );
          id =
            pickActivePipeline(rows)?.pipelineId ??
            rows[0]?.pipelineId ??
            '';
          if (!id) {
            return toolError(
              'no_pipeline',
              'This workflow has no generation runs yet.',
              { workflowId: scoped.workflow.workflowId },
            );
          }
        }

        const snapshot = await orchestration.getPipeline(id, auth);
        return formatPipelineStatus(
          snapshot,
          ruleId,
          scoped.workflow.workflowId,
        );
      }),
    {
      name: 'get_pipeline_status',
      description:
        'Trace node status for a generation run on this brand workflow. Omit pipelineId to use the active run, else the latest. Returns nodeId, type, lane, status, retryCount — not generated text or media. Does not search other workflows.',
      schema: GET_PIPELINE_STATUS_SCHEMA,
    },
  );
}
