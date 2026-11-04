import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolOk } from './tool-error.util';
import { cardWorkflowName, summarizeWorkflowNodes } from './workflow-tool.util';

const LIST_WORKFLOWS_SCHEMA = z.object({});

export function createListWorkflowsTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async () =>
      runTool(async () => {
        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        if (!current) {
          return toolOk({ workflows: [] });
        }
        const summary = {
          workflowId: current.workflow.workflowId,
          name: cardWorkflowName(brandName, current.workflow.name),
          status: String(current.workflow.status),
          nodes: summarizeWorkflowNodes(current.nodes, current.edges ?? []),
        };
        return toolOk({
          action: 'show_workflow',
          workflowId: summary.workflowId,
          ruleId,
          status: summary.status,
          name: summary.name,
          brandName: brandName ?? '',
          nodes: summary.nodes,
          workflows: [summary],
        });
      }),
    {
      name: 'list_workflows',
      description:
        'Show the current content workflow for this brand: steps in execution order with their names (use these names in your reply) and channel lanes. Returns an empty list when none exists. Does not create or run anything.',
      schema: LIST_WORKFLOWS_SCHEMA,
    },
  );
}
