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
} from './pipeline-scope.util';

const LOG_LIMIT = 30;
const MESSAGE_LIMIT = 240;

const GET_PIPELINE_LOGS_SCHEMA = z.object({
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
  nodeId: z
    .string()
    .optional()
    .describe('If set, only logs for this pipeline node.'),
  level: z
    .enum(['INFO', 'WARNING', 'ERROR'])
    .optional()
    .describe('If set, only this log level.'),
});

export function createGetPipelineLogsTool(
  ruleId: string,
  workflowService: WorkflowService,
  pipelines: IPipelineRepository,
  orchestration: OrchestrationService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ pipelineId, workflowId, nodeId, level }) =>
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
        const owned = assertPipelineOnWorkflow({
          pipelineRuleRef: snapshot.pipeline.ruleRef,
          pipelineWorkflowRef: snapshot.pipeline.workflowRef,
          ruleId,
          workflowId: scoped.workflow.workflowId,
        });
        if (owned) return owned;

        const wantedNode = nodeId?.trim() ?? '';
        if (wantedNode && !snapshot.nodes.some((node) => node.nodeId === wantedNode)) {
          return toolError(
            'node_not_found',
            `Node ${wantedNode} is not on this pipeline.`,
            { pipelineId: id },
          );
        }

        const timeline = await orchestration.getPipelineTimeline(id, auth);
        const typeByNode = new Map(
          snapshot.nodes.map((node) => [node.nodeId, String(node.type)]),
        );
        const wantedLevel = level?.toUpperCase();
        const logs = timeline.logs
          .filter((row) => (wantedNode ? row.nodeId === wantedNode : true))
          .filter((row) =>
            wantedLevel ? String(row.level).toUpperCase() === wantedLevel : true,
          )
          .slice(-LOG_LIMIT)
          .map((row) => {
            const message = String(row.message ?? '');
            return {
              timestamp: row.timestamp,
              level: String(row.level),
              nodeId: row.nodeId,
              nodeType: typeByNode.get(row.nodeId) ?? null,
              status: String(row.status),
              message:
                message.length > MESSAGE_LIMIT
                  ? `${message.slice(0, MESSAGE_LIMIT)}…`
                  : message,
            };
          });

        return toolOk({
          pipelineId: id,
          workflowId: scoped.workflow.workflowId,
          status: String(snapshot.pipeline.status),
          logs,
        });
      }),
    {
      name: 'get_pipeline_logs',
      description:
        'Read live/history logs for a generation run on this brand workflow (last 30). Optional nodeId and level (INFO, WARNING, ERROR). Omit pipelineId to use the active run. Short messages only - not generated content. Summarize them; never paste the logs. Does not search other workflows.',
      schema: GET_PIPELINE_LOGS_SCHEMA,
    },
  );
}
