import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import {
  createAddWorkflowNodeTool,
  createRemoveWorkflowNodeTool,
  createReorderWorkflowNodesTool,
  createSetWorkflowChannelsTool,
} from './workflow-edit.tools';

const auth = { userId: 'user-1' } as TenancyAuth;
const ruleId = 'rule-1';

function node(nodeId: string, type: string, order: number, lane: string | null = null) {
  return {
    nodeId,
    type,
    order,
    isLocked: type === 'text_generation',
    userPrompt: '',
    config: lane ? { laneId: lane, ...(type === 'adapt' || type === 'image_generation' ? { channel: lane } : {}) } : {},
    lane,
  };
}

function defaultWorkflow() {
  return {
    workflow: { workflowId: 'wf-1', name: 'Workflow for rule rule-1', status: 'ready', ruleRef: ruleId },
    nodes: [
      node('kw', 'keyword_planner', 1),
      node('web', 'intelligence', 2),
      node('text', 'text_generation', 3),
      node('branch', 'branch', 4),
      node('ad-ig', 'adapt', 5, 'instagram'),
      node('img-ig', 'image_generation', 6, 'instagram'),
      node('ad-tt', 'adapt', 7, 'tiktok'),
      node('merge', 'merge', 8),
    ],
    edges: [],
  };
}

function service() {
  let current = defaultWorkflow();
  const saveNodesForRule = jest.fn(async (_ruleId: string, body: { nodes: ReturnType<typeof node>[] }) => {
    current = { ...current, nodes: body.nodes.map((n) => ({ ...n, userPrompt: '', lane: n.lane ?? null })) };
    return { workflowId: 'wf-1', success: true };
  });
  const ws = {
    getWorkflowByRuleId: jest.fn(async () => current),
    saveNodesForRule,
  } as unknown as WorkflowService;
  return { ws, saveNodesForRule, current: () => current };
}

const parse = (s: unknown) => JSON.parse(s as string);

describe('reorder_workflow_nodes', () => {
  it('refuses text -> image -> adapt -> branch with a canvas link and saves nothing', async () => {
    const { ws, saveNodesForRule } = service();
    const result = parse(
      await createReorderWorkflowNodesTool(ruleId, ws, auth, 'Lumi').invoke({
        nodeIds: ['text', 'img-ig', 'ad-ig', 'branch'],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe('order_not_supported');
    expect(result.openCanvas).toBe(true);
    expect(result.canvasPath).toBe('/workflow/rule-1');
    expect(saveNodesForRule).not.toHaveBeenCalled();
  });

  it('refuses Image before Adapt on the same lane', async () => {
    const { ws } = service();
    const result = parse(
      await createReorderWorkflowNodesTool(ruleId, ws, auth).invoke({
        nodeIds: ['kw', 'web', 'text', 'branch', 'img-ig', 'ad-ig', 'ad-tt', 'merge'],
      }),
    );
    expect(result.code).toBe('order_not_supported');
    expect(result.message).toMatch(/Adapt has to come first/);
  });

  it('saves a valid order and returns a card titled with the brand', async () => {
    const { ws, saveNodesForRule } = service();
    const result = parse(
      await createReorderWorkflowNodesTool(ruleId, ws, auth, 'Lumi').invoke({
        nodeIds: ['kw', 'web', 'text', 'branch', 'ad-tt', 'ad-ig', 'img-ig', 'merge'],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.name).toBe('Lumi · Workflow');
    expect(saveNodesForRule).toHaveBeenCalledTimes(1);
  });
});

describe('remove_workflow_node', () => {
  it('removes the image step', async () => {
    const { ws, current } = service();
    const result = parse(await createRemoveWorkflowNodeTool(ruleId, ws, auth).invoke({ nodeId: 'img-ig' }));
    expect(result.ok).toBe(true);
    expect(current().nodes.some((n) => n.type === 'image_generation')).toBe(false);
  });

  it('will not remove Text', async () => {
    const { ws } = service();
    const result = parse(await createRemoveWorkflowNodeTool(ruleId, ws, auth).invoke({ nodeId: 'text' }));
    expect(result.code).toBe('edit_not_supported');
    expect(result.openCanvas).toBe(true);
  });
});

describe('add_workflow_node', () => {
  it('adds an image on the tiktok lane after its Adapt', async () => {
    const { ws, current } = service();
    const result = parse(
      await createAddWorkflowNodeTool(ruleId, ws, auth).invoke({ type: 'image_generation', lane: 'tiktok' }),
    );
    expect(result.ok).toBe(true);
    expect(current().nodes.filter((n) => n.type === 'image_generation').map((n) => n.lane).sort()).toEqual([
      'instagram',
      'tiktok',
    ]);
  });
});

describe('set_workflow_channels', () => {
  it('TikTok only drops the instagram lane', async () => {
    const { ws, current } = service();
    const result = parse(await createSetWorkflowChannelsTool(ruleId, ws, auth).invoke({ channels: ['tiktok'] }));
    expect(result.ok).toBe(true);
    expect(result.removedLanes).toEqual(['instagram']);
    const lanes = [...new Set(current().nodes.map((n) => n.lane).filter(Boolean))];
    expect(lanes).toEqual(['tiktok']);
  });

  it('adds a missing lane by copying an existing one', async () => {
    const { ws, current } = service();
    const result = parse(
      await createSetWorkflowChannelsTool(ruleId, ws, auth).invoke({ channels: ['instagram', 'tiktok', 'facebook'] }),
    );
    expect(result.ok).toBe(true);
    expect(result.addedLanes).toEqual(['facebook']);
    const fb = current().nodes.filter((n) => n.lane === 'facebook').map((n) => n.type);
    expect(fb).toEqual(['adapt', 'image_generation']);
  });

  it('rejects unsupported channels like Medium', async () => {
    const { ws, saveNodesForRule } = service();
    const result = parse(await createSetWorkflowChannelsTool(ruleId, ws, auth).invoke({ channels: ['medium'] }));
    expect(result.code).toBe('unsupported_channel');
    expect(result.message).toMatch(/TikTok/);
    expect(saveNodesForRule).not.toHaveBeenCalled();
  });
});
