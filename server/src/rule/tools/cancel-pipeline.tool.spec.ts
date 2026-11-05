import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createCancelPipelineTool } from './cancel-pipeline.tool';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function workflows() {
  const snapshot = {
    workflow: { workflowId: 'wf-1', name: 'W', status: 'ready', ruleRef: ruleId },
    nodes: [],
  };
  return {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot),
    getWorkflow: jest.fn().mockResolvedValue(snapshot),
  } as unknown as WorkflowService;
}

function pipelineRow(overrides: Record<string, unknown> = {}) {
  return {
    pipelineId: 'p-1',
    workflowRef: 'wf-1',
    ruleRef: ruleId,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    contentPrompt: 'Thai tea',
    ...overrides,
  };
}

function orchestration() {
  return {
    cancelPipeline: jest.fn().mockResolvedValue({ success: true, keptProgress: false }),
  } as unknown as OrchestrationService;
}

describe('cancel_pipeline', () => {
  it('cancels every running run on this workflow when pipelineId is omitted (I-09)', async () => {
    const pipelines = {
      findPage: jest.fn().mockResolvedValue({
        rows: [
          pipelineRow({ pipelineId: 'p-1' }),
          pipelineRow({ pipelineId: 'p-2', status: 'paused' }),
          pipelineRow({ pipelineId: 'p-3', status: 'completed' }),
        ],
        total: 3,
      }),
    } as unknown as IPipelineRepository;
    const orch = orchestration();
    const parsed = JSON.parse(
      (await createCancelPipelineTool(ruleId, workflows(), pipelines, orch, auth).invoke(
        {},
      )) as string,
    );
    expect(orch.cancelPipeline).toHaveBeenCalledTimes(2);
    expect(orch.cancelPipeline).toHaveBeenCalledWith('p-1', auth);
    expect(orch.cancelPipeline).toHaveBeenCalledWith('p-2', auth);
    expect(parsed).toMatchObject({ ok: true, action: 'pipeline_cancelled' });
    expect(parsed.cancelled).toHaveLength(2);
  });

  it('refuses a run from another workflow', async () => {
    const pipelines = {
      findById: jest.fn().mockResolvedValue(pipelineRow({ workflowRef: 'wf-other' })),
    } as unknown as IPipelineRepository;
    const orch = orchestration();
    const parsed = JSON.parse(
      (await createCancelPipelineTool(ruleId, workflows(), pipelines, orch, auth).invoke({
        pipelineId: 'p-1',
      })) as string,
    );
    expect(parsed.code).toBe('not_found');
    expect(orch.cancelPipeline).not.toHaveBeenCalled();
  });

  it('reports not_active for a finished run', async () => {
    const pipelines = {
      findById: jest.fn().mockResolvedValue(pipelineRow({ status: 'completed' })),
    } as unknown as IPipelineRepository;
    const orch = orchestration();
    const parsed = JSON.parse(
      (await createCancelPipelineTool(ruleId, workflows(), pipelines, orch, auth).invoke({
        pipelineId: 'p-1',
      })) as string,
    );
    expect(parsed.code).toBe('not_active');
    expect(orch.cancelPipeline).not.toHaveBeenCalled();
  });
});
