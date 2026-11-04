import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError, toolOk } from './tool-error.util';

const GET_NODE_CONFIG_SCHEMA = z.object({
  nodeId: z.string().describe('Node id from list_workflows or a workflow card.'),
});

export function createGetNodeConfigTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ nodeId }) =>
      runTool(async () => {
        const trimmedId = nodeId.trim();
        if (!trimmedId) {
          return toolError('node_not_found', 'nodeId is required.');
        }

        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        if (!current) {
          return toolError(
            'no_workflow',
            'This brand has no workflow yet. Create one before reading a node. Offer to set up the default workflow with ask_user (Yes / Not now); do not mention the canvas or drafts.',
          );
        }
        if (current.workflow.ruleRef && current.workflow.ruleRef !== ruleId) {
          return toolError('not_found', 'Workflow not found for this brand.');
        }

        const node = current.nodes.find((item) => item.nodeId === trimmedId);
        if (!node) {
          return toolError(
            'node_not_found',
            `Node ${trimmedId} is not on this workflow.`,
            { workflowId: current.workflow.workflowId },
          );
        }

        const lane =
          typeof node.lane === 'string' && node.lane.trim() ? node.lane.trim() : null;
        return toolOk({
          workflowId: current.workflow.workflowId,
          nodeId: node.nodeId,
          type: String(node.type),
          order: node.order,
          lane,
          isLocked: node.isLocked === true,
          userPrompt: node.userPrompt ?? '',
          config: node.config ?? {},
        });
      }),
    {
      name: 'get_node_config',
      description:
        'Read one workflow node: lane, userPrompt, and config. Call this before update_node_config when you need the current settings. Does not change anything. Use node ids from list_workflows.',
      schema: GET_NODE_CONFIG_SCHEMA,
    },
  );
}
