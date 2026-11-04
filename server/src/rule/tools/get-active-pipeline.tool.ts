import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolOk } from './tool-error.util';
import {
  listPipelinesForWorkflow,
  pickActivePipeline,
  resolveWorkflowForSession,
} from './pipeline-scope.util';
import { formatPipelineStatus } from './get-pipeline-status.tool';

const GET_ACTIVE_PIPELINE_SCHEMA = z.object({
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to inspect. Omit to use the latest workflow for this brand.'),
});

export function createGetActivePipelineTool(
  ruleId: string,
  workflowService: WorkflowService,
  pipelines: IPipelineRepository,
  orchestration: OrchestrationService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ workflowId }) =>
      runTool(async () => {
        const scoped = await resolveWorkflowForSession(
          workflowService,
          ruleId,
          auth,
          workflowId,
        );
        if (!scoped.ok) return scoped.observation;

        const rows = await listPipelinesForWorkflow(
          pipelines,
          scoped.workflow.workflowId,
          auth,
        );
        const active = pickActivePipeline(rows);
        if (!active) {
          return toolOk({
            workflowId: scoped.workflow.workflowId,
            pipeline: null,
            message: 'No running or paused pipeline on this workflow.',
          });
        }

        const snapshot = await orchestration.getPipeline(active.pipelineId, auth);
        return formatPipelineStatus(snapshot, ruleId, scoped.workflow.workflowId);
      }),
    {
      name: 'get_active_pipeline',
      description:
        'Get the currently running or paused pipeline for this brand workflow, with per-node status. Use when they ask how the run is going. Returns pipeline null if nothing is in progress. Does not search other workflows.',
      schema: GET_ACTIVE_PIPELINE_SCHEMA,
    },
  );
}
