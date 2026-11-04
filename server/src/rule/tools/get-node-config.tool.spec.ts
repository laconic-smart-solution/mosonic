import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createGetNodeConfigTool } from './get-node-config.tool';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function readyWorkflow() {
  return {
    workflow: {
      workflowId: 'wf-1',
      name: 'Campaign',
      status: 'ready',
      ruleRef: ruleId,
    },
    nodes: [
      {
        nodeId: 'n-image',
        type: 'image_generation',
        order: 2,
        isLocked: false,
        userPrompt: 'minimalist product shot',
        config: { laneId: 'facebook', size: '1024x1024' },
        lane: 'facebook',
      },
    ],
    edges: [],
  };
}

describe('get_node_config', () => {
  it('returns lane, prompt, and config for one node', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createGetNodeConfigTool(ruleId, workflowService, auth).invoke({
        nodeId: 'n-image',
      })) as string,
    );
    expect(parsed).toEqual({
      ok: true,
      workflowId: 'wf-1',
      nodeId: 'n-image',
      type: 'image_generation',
      order: 2,
      lane: 'facebook',
      isLocked: false,
      userPrompt: 'minimalist product shot',
      config: { laneId: 'facebook', size: '1024x1024' },
    });
    expect(parsed.action).toBeUndefined();
  });

  it('returns no_workflow, node_not_found, and not_found for another rule', async () => {
    const empty = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(null),
    } as unknown as WorkflowService;
    expect(
      JSON.parse(
        (await createGetNodeConfigTool(ruleId, empty, auth).invoke({
          nodeId: 'n-image',
        })) as string,
      ).code,
    ).toBe('no_workflow');

    const present = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    } as unknown as WorkflowService;
    expect(
      JSON.parse(
        (await createGetNodeConfigTool(ruleId, present, auth).invoke({
          nodeId: 'missing',
        })) as string,
      ).code,
    ).toBe('node_not_found');
    expect(
      JSON.parse(
        (await createGetNodeConfigTool(ruleId, present, auth).invoke({
          nodeId: '  ',
        })) as string,
      ).code,
    ).toBe('node_not_found');

    const other = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue({
        ...readyWorkflow(),
        workflow: { ...readyWorkflow().workflow, ruleRef: 'other-rule' },
      }),
    } as unknown as WorkflowService;
    expect(
      JSON.parse(
        (await createGetNodeConfigTool(ruleId, other, auth).invoke({
          nodeId: 'n-image',
        })) as string,
      ).code,
    ).toBe('not_found');
  });
});
