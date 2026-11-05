import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool } from './tool-error.util';
import { guardWorkflowReplace, showWorkflowPayload } from './workflow-tool.util';

const APPLY_DEFAULT_SCHEMA = z.object({
  confirmReplace: z
    .boolean()
    .default(false)
    .describe(
      'Must be true to replace a workflow that already exists. Ask the user first.',
    ),
});

export function createApplyDefaultWorkflowTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ confirmReplace }) =>
      runTool(async () => {
        const blocked = await guardWorkflowReplace(
          workflowService,
          ruleId,
          auth,
          confirmReplace ?? false,
        );
        if (blocked) return blocked;

        const created = await workflowService.applyDefaultWorkflowStructure(
          ruleId,
          auth,
        );
        const snapshot = await workflowService.getWorkflow(created.workflowId, auth);
        return showWorkflowPayload({
          workflowId: created.workflowId,
          ruleId,
          status: String(snapshot.workflow.status || 'ready'),
          name: snapshot.workflow.name,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          brandName,
        });
      }),
    {
      name: 'apply_default_workflow',
      description:
        'Purpose: create the standard workflow (Keyword planner -> Web search -> Text -> per-channel Adapt + one Image) for the brand channels, instantly and with no workflow-generation credit charge. ' +
          'Use when: the brand has no workflow and the user wants to get started ("set it up", "start", "go", "workflow pls", "make the workflow", yes to "Set up the default workflow now?"), or after a no_workflow error and the user agreed. ' +
          'Do NOT use: when a workflow already exists and the user did not ask to replace it; for custom features like video or translation (use generate_workflow); to change one step (use add_workflow_node / remove_workflow_node / update_node_config); to make a post (call start_generation; it sets up the workflow itself). ' +
          'Args: confirmReplace=true only after ask_user confirmed replacing an existing workflow. Does not run the pipeline: never say the post or photo is ready. ' +
          'Errors: workflow_exists (use the existing one or ask first), no_channels (add a channel with update_rule first).',
      schema: APPLY_DEFAULT_SCHEMA,
    },
  );
}
