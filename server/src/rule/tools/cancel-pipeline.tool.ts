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
  resolveWorkflowForSession,
} from './pipeline-scope.util';

export const CANCEL_PIPELINE_TOOL_NAME = 'cancel_pipeline';

const CANCEL_PIPELINE_SCHEMA = z.object({
  pipelineId: z
    .string()
    .optional()
    .describe(
      'Run to stop. Omit to stop every running or paused run on this brand workflow.',
    ),
  workflowId: z
    .string()
    .optional()
    .describe('Workflow to use. Omit to use the latest workflow for this brand.'),
});

const ACTIVE = new Set(['running', 'paused']);

/**
 * Stops a running/paused pipeline through the same OrchestrationService
 * cancel the `POST /pipeline/:id/cancel` endpoint uses. Scoped to this
 * brand's workflow; completed nodes keep their output.
 */
export function createCancelPipelineTool(
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
        const wfId = scoped.workflow.workflowId;

        let targets: string[];
        const requested = pipelineId?.trim();
        if (requested) {
          const row = await pipelines.findById(requested, auth);
          if (!row) {
            return toolError('not_found', 'Pipeline not found for this workflow.');
          }
          const mismatch = assertPipelineOnWorkflow({
            pipelineRuleRef: row.ruleRef,
            pipelineWorkflowRef: row.workflowRef,
            ruleId,
            workflowId: wfId,
          });
          if (mismatch) return mismatch;
          if (!ACTIVE.has(String(row.status))) {
            return toolError(
              'not_active',
              `That run is already ${String(row.status)}, so there is nothing to stop.`,
              { pipelineId: requested, status: String(row.status) },
            );
          }
          targets = [requested];
        } else {
          const rows = await listPipelinesForWorkflow(pipelines, wfId, auth);
          targets = rows
            .filter((row) => ACTIVE.has(row.status))
            .map((row) => row.pipelineId);
          if (targets.length === 0) {
            return toolError(
              'not_active',
              'No running or paused run on this workflow, so there is nothing to stop.',
              { workflowId: wfId },
            );
          }
        }

        const cancelled: { pipelineId: string; keptProgress: boolean; contentId?: string }[] =
          [];
        for (const id of targets) {
          const result = await orchestration.cancelPipeline(id, auth);
          cancelled.push({
            pipelineId: id,
            keptProgress: result.keptProgress,
            ...(result.contentId ? { contentId: result.contentId } : {}),
          });
        }
        return toolOk({
          action: 'pipeline_cancelled',
          workflowId: wfId,
          cancelled,
        });
      }),
    {
      name: CANCEL_PIPELINE_TOOL_NAME,
      description:
        'Stop a running or paused generation run on this brand workflow (omit pipelineId to stop every active run). Use when the user says stop, cancel, or changed their mind about a run. Ask_user to confirm first unless they clearly asked to stop. Never say you cannot stop a run. Finished steps keep their output. To start a new topic afterwards, call start_generation on the next message.',
      schema: CANCEL_PIPELINE_SCHEMA,
    },
  );
}
