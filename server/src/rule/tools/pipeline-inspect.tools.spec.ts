import { NotFoundException } from '@nestjs/common';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createGetActivePipelineTool } from './get-active-pipeline.tool';
import { createGetPipelineLogsTool } from './get-pipeline-logs.tool';
import { createGetPipelineStatusTool } from './get-pipeline-status.tool';
import { createListPipelinesTool } from './list-pipelines.tool';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function workflowSnapshot() {
  return {
    workflow: {
      workflowId: 'wf-1',
      name: 'Campaign',
      status: 'ready',
      ruleRef: ruleId,
    },
    nodes: [],
    edges: [],
  };
}

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    pipelineId: 'pipe-1',
    workflowRef: 'wf-1',
    ruleRef: ruleId,
    status: 'completed',
    contentPrompt: 'Sale post',
    startedAt: '2026-01-02T00:00:00.000Z',
    completedAt: '2026-01-02T00:01:00.000Z',
    ...overrides,
  };
}

describe('list_pipelines', () => {
  it('lists only this workflow and never calls findPage without workflowRef', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const findPage = jest.fn().mockResolvedValue({
      rows: [
        pageRow({ status: 'running', pipelineId: 'pipe-run' }),
        pageRow({ status: 'completed', pipelineId: 'pipe-old' }),
      ],
      total: 2,
    });
    const pipelineService = { findPage } as unknown as IPipelineRepository;
    const parsed = JSON.parse(
      (await createListPipelinesTool(ruleId, workflowService, pipelineService, auth).invoke(
        {},
      )) as string,
    );
    expect(findPage).toHaveBeenCalledWith(
      expect.objectContaining({ workflowRef: 'wf-1', userId: auth.userId }),
      1,
      10,
      'startedAt',
      'desc',
    );
    expect(parsed.activePipelineId).toBe('pipe-run');
    expect(parsed.pipelines).toHaveLength(2);
    expect(parsed.workflows).toBeUndefined();
  });

  it('returns no_workflow and not_found for another rule workflowId', async () => {
    const none = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(null),
    } as unknown as WorkflowService;
    const pipelineService = { findPage: jest.fn() } as unknown as IPipelineRepository;
    expect(
      JSON.parse(
        (await createListPipelinesTool(ruleId, none, pipelineService, auth).invoke({})) as string,
      ).code,
    ).toBe('no_workflow');
    expect(pipelineService.findPage).not.toHaveBeenCalled();

    const other = {
      getWorkflow: jest.fn().mockResolvedValue({
        ...workflowSnapshot(),
        workflow: { ...workflowSnapshot().workflow, ruleRef: 'other-rule' },
      }),
    } as unknown as WorkflowService;
    expect(
      JSON.parse(
        (await createListPipelinesTool(ruleId, other, pipelineService, auth).invoke({
          workflowId: 'wf-1',
        })) as string,
      ).code,
    ).toBe('not_found');
  });
});

describe('get_active_pipeline', () => {
  it('returns pipeline null when this workflow has no running or paused run', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn().mockResolvedValue({
        rows: [pageRow({ status: 'completed' })],
        total: 1,
      }),
    } as unknown as IPipelineRepository;
    const orchestration = { getPipeline: jest.fn() } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetActivePipelineTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({})) as string,
    );
    expect(parsed.pipeline).toBeNull();
    expect(orchestration.getPipeline).not.toHaveBeenCalled();
  });

  it('loads node status for the paused run on this workflow', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn().mockResolvedValue({
        rows: [pageRow({ status: 'paused', pipelineId: 'pipe-pause' })],
        total: 1,
      }),
    } as unknown as IPipelineRepository;
    const orchestration = {
      getPipeline: jest.fn().mockResolvedValue({
        pipeline: {
          pipelineId: 'pipe-pause',
          workflowRef: 'wf-1',
          ruleRef: ruleId,
          contentPrompt: 'Sale',
          status: 'paused',
          pausedNodeId: 'n-image',
        },
        nodes: [
          {
            nodeId: 'n-image',
            type: 'image_generation',
            order: 1,
            lane: 'linkedin',
            status: 'failed',
            retryCount: 1,
          },
        ],
      }),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetActivePipelineTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({})) as string,
    );
    expect(parsed.action).toBe('pipeline_status');
    expect(parsed.pipelineId).toBe('pipe-pause');
    expect(parsed.nodes[0].lane).toBe('linkedin');
  });
});

describe('get_pipeline_status defaults', () => {
  it('uses the latest run when none is active', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn().mockResolvedValue({
        rows: [pageRow({ pipelineId: 'pipe-old', status: 'completed' })],
        total: 1,
      }),
    } as unknown as IPipelineRepository;
    const orchestration = {
      getPipeline: jest.fn().mockResolvedValue({
        pipeline: {
          pipelineId: 'pipe-old',
          workflowRef: 'wf-1',
          ruleRef: ruleId,
          contentPrompt: 'Old',
          status: 'completed',
          pausedNodeId: null,
        },
        nodes: [],
      }),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetPipelineStatusTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({})) as string,
    );
    expect(parsed.pipelineId).toBe('pipe-old');
    expect(orchestration.getPipeline).toHaveBeenCalledWith('pipe-old', auth);
  });

  it('returns no_pipeline when the workflow has no runs', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    } as unknown as IPipelineRepository;
    const orchestration = { getPipeline: jest.fn() } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetPipelineStatusTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({})) as string,
    );
    expect(parsed.code).toBe('no_pipeline');
  });
});

describe('get_pipeline_logs', () => {
  it('returns last logs for the active run on this workflow and filters by node and level', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn().mockResolvedValue({
        rows: [pageRow({ status: 'running', pipelineId: 'pipe-run' })],
        total: 1,
      }),
    } as unknown as IPipelineRepository;
    const orchestration = {
      getPipeline: jest.fn().mockResolvedValue({
        pipeline: {
          pipelineId: 'pipe-run',
          workflowRef: 'wf-1',
          ruleRef: ruleId,
          contentPrompt: 'Sale',
          status: 'running',
        },
        nodes: [
          { nodeId: 'n-text', type: 'text_generation', order: 1 },
          { nodeId: 'n-image', type: 'image_generation', order: 2 },
        ],
      }),
      getPipelineTimeline: jest.fn().mockResolvedValue({
        pipeline: { pipelineId: 'pipe-run', status: 'running' },
        nodes: [],
        logs: [
          {
            nodeId: 'n-text',
            level: 'INFO',
            status: 'completed',
            message: 'Text done',
            timestamp: 't1',
          },
          {
            nodeId: 'n-image',
            level: 'ERROR',
            status: 'failed',
            message: 'e'.repeat(300),
            timestamp: 't2',
          },
        ],
      }),
    } as unknown as OrchestrationService;
    const all = JSON.parse(
      (await createGetPipelineLogsTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({})) as string,
    );
    expect(all.logs).toHaveLength(2);
    expect(all.logs[1].message).toHaveLength(241);
    expect(all.logs[1].nodeType).toBe('image_generation');

    const filtered = JSON.parse(
      (await createGetPipelineLogsTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({ nodeId: 'n-image', level: 'ERROR' })) as string,
    );
    expect(filtered.logs).toHaveLength(1);
    expect(filtered.logs[0].nodeId).toBe('n-image');
  });

  it('returns node_not_found and not_found for a pipeline on another workflow', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = {
      findPage: jest.fn(),
    } as unknown as IPipelineRepository;
    const orchestration = {
      getPipeline: jest.fn().mockResolvedValue({
        pipeline: {
          pipelineId: 'pipe-1',
          workflowRef: 'wf-1',
          ruleRef: ruleId,
          status: 'running',
        },
        nodes: [{ nodeId: 'n-text', type: 'text_generation', order: 1 }],
      }),
      getPipelineTimeline: jest.fn(),
    } as unknown as OrchestrationService;
    const missingNode = JSON.parse(
      (await createGetPipelineLogsTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({ pipelineId: 'pipe-1', nodeId: 'missing' })) as string,
    );
    expect(missingNode.code).toBe('node_not_found');

    (orchestration.getPipeline as jest.Mock).mockResolvedValue({
      pipeline: {
        pipelineId: 'pipe-2',
        workflowRef: 'wf-other',
        ruleRef: ruleId,
        status: 'running',
      },
      nodes: [],
    });
    const otherWf = JSON.parse(
      (await createGetPipelineLogsTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({ pipelineId: 'pipe-2' })) as string,
    );
    expect(otherWf.code).toBe('not_found');
    expect(orchestration.getPipelineTimeline).not.toHaveBeenCalled();
  });

  it('maps a missing pipeline id to not_found', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflowSnapshot()),
    } as unknown as WorkflowService;
    const pipelineService = { findPage: jest.fn() } as unknown as IPipelineRepository;
    const orchestration = {
      getPipeline: jest.fn().mockRejectedValue(new NotFoundException('missing')),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetPipelineLogsTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({ pipelineId: 'missing' })) as string,
    );
    expect(parsed.code).toBe('not_found');
  });
});
