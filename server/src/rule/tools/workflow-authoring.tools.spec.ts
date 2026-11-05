import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InsufficientCreditsException } from '../../credit/insufficient-credits.exception';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createListWorkflowsTool } from './list-workflows.tool';
import { createGenerateWorkflowTool } from './generate-workflow.tool';

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
        nodeId: 'n1',
        type: 'text_generation',
        order: 1,
        isLocked: true,
        config: {},
        lane: null,
      },
    ],
    edges: [],
  };
}

describe('list_workflows', () => {
  it('returns an empty list when the brand has no workflow', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(null),
    } as unknown as WorkflowService;
    const raw = await createListWorkflowsTool(ruleId, workflowService, auth).invoke({});
    expect(JSON.parse(raw as string)).toEqual({ ok: true, workflows: [] });
  });

  it('returns a workflow card summary for the latest workflow', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createListWorkflowsTool(ruleId, workflowService, auth).invoke({})) as string,
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('show_workflow');
    expect(parsed.workflows).toEqual([
      {
        workflowId: 'wf-1',
        name: 'Campaign',
        status: 'ready',
        nodes: [
          {
            nodeId: 'n1',
            type: 'text_generation',
            label: 'Text',
            order: 1,
            lane: null,
            isLocked: true,
          },
        ],
      },
    ]);
    expect(parsed.nodes[0].config).toBeUndefined();
  });
});

describe('generate_workflow', () => {
  function service(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(null),
      regenerateWorkflowByRuleId: jest.fn().mockResolvedValue({
        workflowId: 'wf-new',
        ruleId,
      }),
      getWorkflow: jest.fn().mockResolvedValue({
        ...readyWorkflow(),
        workflow: { ...readyWorkflow().workflow, workflowId: 'wf-new', status: 'generating' },
      }),
      ...overrides,
    } as unknown as WorkflowService;
  }

  it('starts generation when no workflow exists', async () => {
    const workflowService = service();
    const parsed = JSON.parse(
      (await createGenerateWorkflowTool(ruleId, workflowService, auth).invoke({
        generateImage: true,
        imageChannels: ['instagram'],
      })) as string,
    );
    expect(parsed).toMatchObject({
      ok: true,
      action: 'show_workflow',
      workflowId: 'wf-new',
      ruleId,
      status: 'generating',
    });
    expect(workflowService.regenerateWorkflowByRuleId).toHaveBeenCalledWith(
      ruleId,
      expect.objectContaining({
        answers: expect.objectContaining({
          generateImage: true,
          imageChannels: ['instagram'],
          useKeywordPlanner: false,
          additionalMessage: '',
        }),
      }),
      auth,
    );
  });

  it('refuses to replace a ready workflow without confirmReplace', async () => {
    const workflowService = service({
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    });
    const parsed = JSON.parse(
      (await createGenerateWorkflowTool(ruleId, workflowService, auth).invoke({})) as string,
    );
    expect(parsed.code).toBe('workflow_exists');
    expect(parsed.workflowId).toBe('wf-1');
    expect(workflowService.regenerateWorkflowByRuleId).not.toHaveBeenCalled();
  });

  it('refuses to start while a generation is already in progress', async () => {
    const workflowService = service({
      getWorkflowByRuleId: jest.fn().mockResolvedValue({
        ...readyWorkflow(),
        workflow: { ...readyWorkflow().workflow, status: 'generating' },
      }),
    });
    const parsed = JSON.parse(
      (await createGenerateWorkflowTool(ruleId, workflowService, auth).invoke({
        confirmReplace: true,
      })) as string,
    );
    expect(parsed.code).toBe('generation_in_progress');
    expect(workflowService.regenerateWorkflowByRuleId).not.toHaveBeenCalled();
  });

  it('replaces when confirmReplace is true', async () => {
    const workflowService = service({
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    });
    const parsed = JSON.parse(
      (await createGenerateWorkflowTool(ruleId, workflowService, auth).invoke({
        confirmReplace: true,
      })) as string,
    );
    expect(parsed.ok).toBe(true);
    expect(workflowService.regenerateWorkflowByRuleId).toHaveBeenCalled();
  });

  it('maps missing channels, invalid QA channels, missing rule, and credits', async () => {
    const cases: Array<{ error: Error; code: string }> = [
      {
        error: new BadRequestException(
          'Rule must include at least one distribution channel before generating a workflow',
        ),
        code: 'no_channels',
      },
      {
        error: new BadRequestException(
          'Select at least one rule channel for image generation',
        ),
        code: 'invalid_channels',
      },
      {
        error: new NotFoundException('Rule rule-1 not found'),
        code: 'not_found',
      },
      {
        error: new InsufficientCreditsException({
          requiredCredits: 8,
          creditsRemaining: 1,
        }),
        code: 'insufficient_credits',
      },
    ];

    for (const item of cases) {
      const workflowService = service({
        regenerateWorkflowByRuleId: jest.fn().mockRejectedValue(item.error),
      });
      const parsed = JSON.parse(
        (await createGenerateWorkflowTool(ruleId, workflowService, auth).invoke({
          generateImage: true,
          imageChannels: ['instagram'],
        })) as string,
      );
      expect(parsed.ok).toBe(false);
      expect(parsed.code).toBe(item.code);
      if (item.code === 'insufficient_credits') {
        expect(parsed.requiredCredits).toBe(8);
        expect(parsed.creditsRemaining).toBe(1);
      }
      if (item.code === 'invalid_channels') {
        expect(parsed.message).toContain('apply_default_workflow');
      }
    }
  });
});
