import type { TenancyAuth } from '../../auth/tenancy.types';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createStartGenerationTool } from './start-generation.tool';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function snapshot(extra: Array<Record<string, unknown>> = []) {
  return {
    workflow: { workflowId: 'wf-1', name: 'W', status: 'ready', ruleRef: ruleId },
    nodes: [{ nodeId: 'n-text', type: 'text_generation', order: 1, isLocked: true, config: {}, lane: null }, ...extra],
    edges: [],
  };
}
const ws = (snap: unknown) => ({ getWorkflowByRuleId: jest.fn().mockResolvedValue(snap), getWorkflow: jest.fn().mockResolvedValue(snap) }) as unknown as WorkflowService;

describe('start_generation languages (B)', () => {
  it('stops with no_translation_step when the request asks for a language the workflow lacks', async () => {
    const orchestration = { startPipeline: jest.fn() } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, ws(snapshot()), orchestration, auth, undefined, { requestText: 'make a sale post in Thai' }).invoke({ contentPrompt: 'Sale post' })) as string,
    );
    expect(parsed.code).toBe('no_translation_step');
    expect(parsed.missingLanguages).toEqual(['th']);
    expect(parsed.next).toMatch(/add_workflow_node/);
    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });

  it('accepts a languages arg and starts when a translation step covers it', async () => {
    const orchestration = { startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'p1' }) } as unknown as OrchestrationService;
    const snap = snapshot([{ nodeId: 'n-tr', type: 'translation', order: 2, isLocked: false, config: { targetLanguage: 'ja' }, lane: null }]);
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, ws(snap), orchestration, auth).invoke({ contentPrompt: 'Sale post', languages: ['Japanese'] })) as string,
    );
    expect(parsed).toMatchObject({ ok: true, action: 'pipeline_started' });
    expect(parsed.brief.languages).toEqual(['ja']);
  });

  it('skips translation when the user chose skip, and ignores the base language', async () => {
    const orchestration = { startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'p1' }) } as unknown as OrchestrationService;
    const skipped = JSON.parse(
      (await createStartGenerationTool(ruleId, ws(snapshot()), orchestration, auth, undefined, { requestText: 'post in Thai' }).invoke({ contentPrompt: 'Sale', skipTranslation: true })) as string,
    );
    expect(skipped.ok).toBe(true);
    const base = JSON.parse(
      (await createStartGenerationTool(ruleId, ws(snapshot()), orchestration, auth, undefined, { requestText: 'post in Thai', baseLanguage: 'th' }).invoke({ contentPrompt: 'Sale' })) as string,
    );
    expect(base.ok).toBe(true);
  });

  it('rejects with brand_not_ready when brand readiness check fails', async () => {
    const orchestration = { startPipeline: jest.fn() } as unknown as OrchestrationService;
    const tool = createStartGenerationTool(ruleId, ws(snapshot()), orchestration, auth, undefined, {
      checkBrandReady: () => ({ ready: false, reason: 'Brand profile is not ready.' }),
    });
    const parsed = JSON.parse((await tool.invoke({ contentPrompt: 'Sale' })) as string);
    expect(parsed.code).toBe('brand_not_ready');
    expect(parsed.error).toContain('Brand profile is not ready');
    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });
});
