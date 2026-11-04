import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolOk } from './tool-error.util';
import {
  listPipelinesForWorkflow,
  pickActivePipeline,
  resolveWorkflowForSession,
} from './pipeline-scope.util';

const LIST_PIPELINES_SCHEMA = z.object({
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to inspect. Omit to use the latest workflow for this brand.'),
});

export function createListPipelinesTool(
  ruleId: string,
  workflowService: WorkflowService,
  pipelines: IPipelineRepository,
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
        return toolOk({
          workflowId: scoped.workflow.workflowId,
          activePipelineId: active?.pipelineId ?? null,
          pipelines: rows,
        });
      }),
    {
      name: 'list_pipelines',
      description:
        'List generation runs for this brand workflow only (newest first, max 10). Never lists other workflows. Use this to find pipeline ids. Marks activePipelineId when a run is running or paused.',
      schema: LIST_PIPELINES_SCHEMA,
    },
  );
}
