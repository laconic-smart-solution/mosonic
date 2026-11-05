import { NotFoundException } from '@nestjs/common';
import { InsufficientCreditsException } from '../../credit/insufficient-credits.exception';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { LlmService } from '../../llm/llm.service';
import type { OrchestrationService } from '../../orchestration/orchestration.service';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createApplyDefaultWorkflowTool } from './apply-default-workflow.tool';
import { createGetPipelineStatusTool } from './get-pipeline-status.tool';
import { createStartGenerationTool } from './start-generation.tool';
import { createUpdateNodeConfigTool } from './update-node-config.tool';

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
        nodeId: 'n-text',
        type: 'text_generation',
        order: 1,
        isLocked: true,
        config: { temperature: 0.7 },
        lane: null,
      },
      {
        nodeId: 'n-image',
        type: 'image_generation',
        order: 2,
        isLocked: false,
        config: {},
        lane: 'instagram',
      },
    ],
    edges: [{ from: 'n-text', to: 'n-image' }],
  };
}

describe('apply_default_workflow', () => {
  it('applies the default structure when none exists and returns ready nodes', async () => {
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(null),
      applyDefaultWorkflowStructure: jest.fn().mockResolvedValue({
        workflowId: 'wf-1',
        ruleId,
      }),
      getWorkflow: jest.fn().mockResolvedValue(readyWorkflow()),
    } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createApplyDefaultWorkflowTool(ruleId, workflowService, auth).invoke({})) as string,
    );
    expect(parsed).toMatchObject({
      ok: true,
      action: 'show_workflow',
      status: 'ready',
      workflowId: 'wf-1',
    });
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0].config).toBeUndefined();
  });

  it('blocks replace and in-progress the same way as generate', async () => {
    const existing = {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
      applyDefaultWorkflowStructure: jest.fn(),
    } as unknown as WorkflowService;
    const blocked = JSON.parse(
      (await createApplyDefaultWorkflowTool(ruleId, existing, auth).invoke({})) as string,
    );
    expect(blocked.code).toBe('workflow_exists');
    expect(existing.applyDefaultWorkflowStructure).not.toHaveBeenCalled();
  });
});

describe('update_node_config', () => {
  const llm = {
    validateWorkflowNodeConfig: jest.fn(),
  } as unknown as LlmService;

  function service(snapshot = readyWorkflow()) {
    return {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot),
      saveNodesForRule: jest.fn().mockResolvedValue({ workflowId: 'wf-1', success: true }),
    } as unknown as WorkflowService;
  }

  it('refuses useBrandLogo and points at rerun_content_node', async () => {
    const workflowService = service();
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-image',
        config: { useBrandLogo: true },
      })) as string,
    );
    expect(parsed.code).toBe('use_content_rerun');
    expect(workflowService.saveNodesForRule).not.toHaveBeenCalled();
  });

  it('rejects an empty patch', async () => {
    const workflowService = service();
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-text',
      })) as string,
    );
    expect(parsed.code).toBe('empty_patch');
    expect(workflowService.saveNodesForRule).not.toHaveBeenCalled();
  });

  it('returns no_workflow, generation_in_progress, workflow_not_ready, and node_not_found', async () => {
    const none = service();
    (none.getWorkflowByRuleId as jest.Mock).mockResolvedValue(null);
    expect(
      JSON.parse(
        (await createUpdateNodeConfigTool(ruleId, none, llm, auth).invoke({
          nodeId: 'n-text',
          userPrompt: 'hi',
        })) as string,
      ).code,
    ).toBe('no_workflow');

    const generating = service({
      ...readyWorkflow(),
      workflow: { ...readyWorkflow().workflow, status: 'generating' },
    });
    expect(
      JSON.parse(
        (await createUpdateNodeConfigTool(ruleId, generating, llm, auth).invoke({
          nodeId: 'n-text',
          userPrompt: 'hi',
        })) as string,
      ).code,
    ).toBe('generation_in_progress');

    const failed = service({
      ...readyWorkflow(),
      workflow: { ...readyWorkflow().workflow, status: 'failed' },
    });
    expect(
      JSON.parse(
        (await createUpdateNodeConfigTool(ruleId, failed, llm, auth).invoke({
          nodeId: 'n-text',
          userPrompt: 'hi',
        })) as string,
      ).code,
    ).toBe('workflow_not_ready');

    const missingNode = service();
    expect(
      JSON.parse(
        (await createUpdateNodeConfigTool(ruleId, missingNode, llm, auth).invoke({
          nodeId: 'missing',
          userPrompt: 'hi',
        })) as string,
      ).code,
    ).toBe('node_not_found');
  });

  it('returns invalid_config and does not save', async () => {
    const workflowService = service();
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-text',
        config: { temperature: 'hot' },
      })) as string,
    );
    expect(parsed.code).toBe('invalid_config');
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(workflowService.saveNodesForRule).not.toHaveBeenCalled();
  });

  it('returns invalid_config when the provider check fails', async () => {
    const workflowService = service();
    const strictLlm = {
      validateWorkflowNodeConfig: jest.fn(() => {
        throw new Error('Provider "openai" does not support image generation');
      }),
    } as unknown as LlmService;
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, strictLlm, auth).invoke({
        nodeId: 'n-image',
        config: { aspectRatio: '1:1' },
      })) as string,
    );
    expect(parsed.code).toBe('invalid_config');
    expect(workflowService.saveNodesForRule).not.toHaveBeenCalled();
  });

  it('saves the full node list with the locked text node still present', async () => {
    const workflowService = service();
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-text',
        userPrompt: 'Keep it short',
        config: { temperature: 0.2 },
      })) as string,
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('show_workflow');
    const body = (workflowService.saveNodesForRule as jest.Mock).mock.calls[0][1];
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes[0]).toMatchObject({
      nodeId: 'n-text',
      type: 'text_generation',
      isLocked: true,
      userPrompt: 'Keep it short',
    });
    expect(body.nodes[0].config.temperature).toBe(0.2);
    expect(body.nodes[1].nodeId).toBe('n-image');
    expect(body.nodes[1].userPrompt).toBeUndefined();
    expect(body.edges).toEqual([{ from: 'n-text', to: 'n-image' }]);
  });

  it('moves an image from facebook to linkedin when config.channel is LinkedIn', async () => {
    const snapshot = {
      workflow: {
        workflowId: 'wf-1',
        name: 'Campaign',
        status: 'ready',
        ruleRef: ruleId,
      },
      nodes: [
        {
          nodeId: 'n-branch',
          type: 'branch',
          order: 1,
          isLocked: false,
          config: {},
          lane: null,
        },
        {
          nodeId: 'n-adapt-fb',
          type: 'adapt',
          order: 2,
          isLocked: false,
          config: { laneId: 'facebook' },
          lane: 'facebook',
        },
        {
          nodeId: 'n-adapt-li',
          type: 'adapt',
          order: 3,
          isLocked: false,
          config: { laneId: 'linkedin' },
          lane: 'linkedin',
        },
        {
          nodeId: 'n-image',
          type: 'image_generation',
          order: 4,
          isLocked: false,
          config: { laneId: 'facebook' },
          lane: 'facebook',
        },
        {
          nodeId: 'n-merge',
          type: 'merge',
          order: 5,
          isLocked: false,
          config: {},
          lane: null,
        },
      ],
      edges: [],
    };
    const saveNodesForRule = jest.fn().mockResolvedValue({
      workflowId: 'wf-1',
      success: true,
    });
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockImplementation(async () => {
        const saved = saveNodesForRule.mock.calls.at(-1)?.[1] as
          | { nodes: typeof snapshot.nodes; edges: unknown[] }
          | undefined;
        if (!saved) return snapshot;
        return { ...snapshot, nodes: saved.nodes, edges: saved.edges };
      }),
      saveNodesForRule,
    } as unknown as WorkflowService;

    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-image',
        config: { channel: 'LinkedIn' },
      })) as string,
    );

    const image = parsed.nodes.find(
      (node: { nodeId: string }) => node.nodeId === 'n-image',
    );
    expect(image.lane).toBe('linkedin');
    const saved = saveNodesForRule.mock.calls[0][1];
    const savedImage = saved.nodes.find(
      (node: { nodeId: string }) => node.nodeId === 'n-image',
    );
    expect(savedImage.lane).toBe('linkedin');
    expect(savedImage.config.laneId).toBe('linkedin');
    expect(savedImage.config.channel).toBe('linkedin');
    expect(saved.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'n-branch',
          to: 'n-adapt-li',
          sourceHandle: 'linkedin',
        }),
        expect.objectContaining({ from: 'n-adapt-li', to: 'n-image' }),
      ]),
    );
    expect(
      saved.edges.some(
        (edge: { to?: string; sourceHandle?: string }) =>
          edge.to === 'n-image' && edge.sourceHandle === 'facebook',
      ),
    ).toBe(false);
  });

  it('rejects an unknown channel and a lane that already has that node type', async () => {
    const snapshot = {
      ...readyWorkflow(),
      nodes: [
        ...readyWorkflow().nodes,
        {
          nodeId: 'n-image-li',
          type: 'image_generation',
          order: 3,
          isLocked: false,
          config: {},
          lane: 'linkedin',
        },
      ],
    };
    const workflowService = service(snapshot);
    const unknown = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-image',
        lane: 'pinterest',
      })) as string,
    );
    expect(unknown.code).toBe('invalid_lane');

    const taken = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-image',
        lane: 'linkedin',
      })) as string,
    );
    expect(taken.code).toBe('lane_taken');
    expect(workflowService.saveNodesForRule).not.toHaveBeenCalled();
  });

  it('hides a workflow that belongs to another rule', async () => {
    const workflowService = service({
      ...readyWorkflow(),
      workflow: { ...readyWorkflow().workflow, ruleRef: 'other-rule' },
    });
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({
        nodeId: 'n-text',
        userPrompt: 'hi',
      })) as string,
    );
    expect(parsed.code).toBe('not_found');
  });
});

describe('update_node_config lane result', () => {
  const llm = { validateWorkflowNodeConfig: jest.fn() } as unknown as LlmService;
  function twoLanes() {
    const wf = readyWorkflow();
    wf.nodes.push({ nodeId: 'n-adapt-tt', type: 'adapt', order: 3, isLocked: false, config: {}, lane: 'tiktok' });
    return wf;
  }

  it('reports lane_unchanged without saving when the step is already on that channel', async () => {
    const saveNodesForRule = jest.fn();
    const workflowService = { getWorkflowByRuleId: jest.fn().mockResolvedValue(twoLanes()), saveNodesForRule } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({ nodeId: 'n-image', lane: 'instagram' })) as string,
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('lane_unchanged');
    expect(parsed.next).toMatch(/do not say you moved it/);
    expect(saveNodesForRule).not.toHaveBeenCalled();
  });

  it('still saves a prompt change that repeats the current lane', async () => {
    const saveNodesForRule = jest.fn().mockResolvedValue({ workflowId: 'wf-1', success: true });
    const workflowService = { getWorkflowByRuleId: jest.fn().mockResolvedValue(twoLanes()), saveNodesForRule } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({ nodeId: 'n-image', lane: 'instagram', userPrompt: 'Brighter' })) as string,
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.laneChange).toEqual({ from: 'instagram', to: 'instagram' });
    expect(saveNodesForRule).toHaveBeenCalled();
  });

  it('returns the real lane change when the move is saved', async () => {
    const snapshot = twoLanes();
    const saveNodesForRule = jest.fn().mockResolvedValue({ workflowId: 'wf-1', success: true });
    const workflowService = {
      getWorkflowByRuleId: jest.fn().mockImplementation(async () => {
        const saved = saveNodesForRule.mock.calls.at(-1)?.[1] as { nodes: typeof snapshot.nodes } | undefined;
        return saved ? { ...snapshot, nodes: saved.nodes } : snapshot;
      }),
      saveNodesForRule,
    } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({ nodeId: 'n-image', lane: 'tiktok' })) as string,
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.laneChange).toEqual({ from: 'instagram', to: 'tiktok' });
  });

  it('returns lane_not_changed when the saved workflow still has the old lane', async () => {
    const saveNodesForRule = jest.fn().mockResolvedValue({ workflowId: 'wf-1', success: true });
    // The reload returns the old snapshot: the move did not stick.
    const workflowService = { getWorkflowByRuleId: jest.fn().mockResolvedValue(twoLanes()), saveNodesForRule } as unknown as WorkflowService;
    const parsed = JSON.parse(
      (await createUpdateNodeConfigTool(ruleId, workflowService, llm, auth).invoke({ nodeId: 'n-image', lane: 'tiktok' })) as string,
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('lane_not_changed');
    expect(parsed.lane).toBe('instagram');
  });
});

describe('start_generation', () => {
  function workflowService(snapshot: ReturnType<typeof readyWorkflow> | null = readyWorkflow()) {
    return {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot),
      getWorkflow: jest.fn().mockImplementation(async (id: string) => {
        if (!snapshot || snapshot.workflow.workflowId !== id) {
          throw new NotFoundException(`Workflow ${id} not found`);
        }
        return snapshot;
      }),
    } as unknown as WorkflowService;
  }

  it('with no workflow sets up the default one, then starts (first post in one turn)', async () => {
    const orchestration = { startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'pl-1' }) } as unknown as OrchestrationService;
    const ws = workflowService(null);
    const setupDefaultWorkflow = jest.fn(async () => {
      (ws.getWorkflowByRuleId as jest.Mock).mockResolvedValue(readyWorkflow());
    });
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, ws, orchestration, auth, undefined, { setupDefaultWorkflow }).invoke({
        contentPrompt: 'Announce our website',
      })) as string,
    );
    expect(setupDefaultWorkflow).toHaveBeenCalledTimes(1);
    expect(parsed).toMatchObject({ ok: true, action: 'pipeline_started', workflowCreated: true });
    expect(orchestration.startPipeline).toHaveBeenCalled();
  });

  it('rejects an empty prompt before calling orchestration', async () => {
    const orchestration = { startPipeline: jest.fn() } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, workflowService(), orchestration, auth).invoke({
        contentPrompt: '   ',
      })) as string,
    );
    expect(parsed.code).toBe('empty_prompt');
    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });

  it('returns no_workflow, workflow_not_ready, empty_workflow, and not_found', async () => {
    const orchestration = { startPipeline: jest.fn() } as unknown as OrchestrationService;

    expect(
      JSON.parse(
        (await createStartGenerationTool(
          ruleId,
          workflowService(null),
          orchestration,
          auth,
        ).invoke({ contentPrompt: 'Sale post' })) as string,
      ).code,
    ).toBe('no_workflow');

    const generating = readyWorkflow();
    generating.workflow.status = 'generating';
    expect(
      JSON.parse(
        (await createStartGenerationTool(
          ruleId,
          workflowService(generating),
          orchestration,
          auth,
        ).invoke({ contentPrompt: 'Sale post' })) as string,
      ).code,
    ).toBe('workflow_not_ready');

    const empty = readyWorkflow();
    empty.nodes = [];
    expect(
      JSON.parse(
        (await createStartGenerationTool(ruleId, workflowService(empty), orchestration, auth).invoke({
          contentPrompt: 'Sale post',
        })) as string,
      ).code,
    ).toBe('empty_workflow');

    const other = readyWorkflow();
    other.workflow.ruleRef = 'other-rule';
    expect(
      JSON.parse(
        (await createStartGenerationTool(ruleId, workflowService(other), orchestration, auth).invoke({
          contentPrompt: 'Sale post',
          workflowId: 'wf-1',
        })) as string,
      ).code,
    ).toBe('scope_mismatch');

    expect(
      JSON.parse(
        (await createStartGenerationTool(ruleId, workflowService(null), orchestration, auth).invoke({
          contentPrompt: 'Sale post',
          workflowId: 'missing',
        })) as string,
      ).code,
    ).toBe('not_found');

    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });

  it('starts the pipeline for the session rule and stops with pipeline_started', async () => {
    const orchestration = {
      startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'pipe-1' }),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, workflowService(), orchestration, auth).invoke({
        contentPrompt: '  Black Friday post  ',
      })) as string,
    );
    expect(parsed).toEqual({
      ok: true,
      action: 'pipeline_started',
      pipelineId: 'pipe-1',
      workflowId: 'wf-1',
      status: 'running',
      brief: { topic: 'Black Friday post', channels: ['instagram'], style: null, images: true, referenceImages: 0, notPossible: [] },
      referenceImagesUsed: 0,
      mediaReady: false,
      outcome: 'started_not_done',
      next: expect.stringContaining('never say anything is ready'),
      message: 'No reference images were used.',
    });
    expect(orchestration.startPipeline).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      ruleId,
      contentPrompt: 'Black Friday post',
      auth,
      metadata: { source: 'manual' },
    });
  });

  it('maps insufficient credits from orchestration', async () => {
    const orchestration = {
      startPipeline: jest.fn().mockRejectedValue(
        new InsufficientCreditsException({ requiredCredits: 20, creditsRemaining: 3 }),
      ),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, workflowService(), orchestration, auth).invoke({
        contentPrompt: 'Sale post',
      })) as string,
    );
    expect(parsed.code).toBe('insufficient_credits');
    expect(parsed.requiredCredits).toBe(20);
    expect(parsed.creditsRemaining).toBe(3);
  });
});

describe('get_pipeline_status', () => {
  const workflowService = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
    getWorkflow: jest.fn().mockResolvedValue(readyWorkflow()),
  } as unknown as WorkflowService;
  const pipelineService = {
    findPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  } as unknown as IPipelineRepository;

  it('returns not_found for a missing id, another brand, or another workflow', async () => {
    const orchestration = {
      getPipeline: jest.fn().mockRejectedValue(new NotFoundException('Pipeline pipe-x not found')),
    } as unknown as OrchestrationService;
    const tool = createGetPipelineStatusTool(
      ruleId,
      workflowService,
      pipelineService,
      orchestration,
      auth,
    );
    expect(JSON.parse((await tool.invoke({ pipelineId: 'pipe-x' })) as string).code).toBe(
      'not_found',
    );

    (orchestration.getPipeline as jest.Mock).mockResolvedValue({
      pipeline: {
        pipelineId: 'pipe-1',
        workflowRef: 'wf-1',
        ruleRef: 'other-rule',
        contentPrompt: 'secret',
        status: 'running',
        pausedNodeId: null,
      },
      nodes: [],
    });
    expect(JSON.parse((await tool.invoke({ pipelineId: 'pipe-1' })) as string).code).toBe(
      'not_found',
    );

    (orchestration.getPipeline as jest.Mock).mockResolvedValue({
      pipeline: {
        pipelineId: 'pipe-1',
        workflowRef: 'wf-other',
        ruleRef: ruleId,
        contentPrompt: 'secret',
        status: 'running',
        pausedNodeId: null,
      },
      nodes: [],
    });
    expect(JSON.parse((await tool.invoke({ pipelineId: 'pipe-1' })) as string).code).toBe(
      'not_found',
    );
  });

  it('returns status counts without outputs and truncates the prompt', async () => {
    const orchestration = {
      getPipeline: jest.fn().mockResolvedValue({
        pipeline: {
          pipelineId: 'pipe-1',
          workflowRef: 'wf-1',
          ruleRef: ruleId,
          contentPrompt: 'x'.repeat(200),
          status: 'paused',
          pausedNodeId: 'n-image',
        },
        nodes: [
          {
            nodeId: 'n-text',
            type: 'text_generation',
            order: 1,
            lane: null,
            status: 'completed',
            retryCount: 0,
            output: { text: 'should not leak' },
            config: { temperature: 0.7 },
          },
          {
            nodeId: 'n-image',
            type: 'image_generation',
            order: 2,
            lane: 'linkedin',
            status: 'failed',
            retryCount: 1,
            output: { fileUrl: 'https://secret' },
          },
        ],
      }),
    } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createGetPipelineStatusTool(
        ruleId,
        workflowService,
        pipelineService,
        orchestration,
        auth,
      ).invoke({
        pipelineId: 'pipe-1',
      })) as string,
    );
    expect(parsed).toMatchObject({
      ok: true,
      action: 'pipeline_status',
      pipelineId: 'pipe-1',
      status: 'paused',
      pausedNodeId: 'n-image',
      counts: { completed: 1, failed: 1 },
    });
    expect(parsed.contentPrompt).toHaveLength(161);
    expect(parsed.contentPrompt.endsWith('…')).toBe(true);
    expect(parsed.nodes[0]).toMatchObject({
      nodeId: 'n-text',
      lane: null,
      status: 'completed',
    });
    expect(parsed.nodes[1].lane).toBe('linkedin');
    expect(parsed.nodes[0].output).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('should not leak');
    expect(JSON.stringify(parsed)).not.toContain('fileUrl');
  });
});

describe('start_generation text-only request', () => {
  const workflowService = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(readyWorkflow()),
  } as unknown as WorkflowService;

  it('does not start a run with images when the latest message asked for text only', async () => {
    const orchestration = { startPipeline: jest.fn() } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, workflowService, orchestration, auth, undefined, { textOnlyRequest: true }).invoke({
        contentPrompt: 'New feature, text only',
      })) as string,
    );
    expect(parsed.code).toBe('image_step_present');
    expect(parsed.next).toMatch(/Remove the image step, then make the post/);
    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });

  it('starts normally when the latest message did not ask for text only (e.g. the Keep images chip)', async () => {
    const orchestration = { startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'p-1' }) } as unknown as OrchestrationService;
    const parsed = JSON.parse(
      (await createStartGenerationTool(ruleId, workflowService, orchestration, auth, undefined, { textOnlyRequest: false }).invoke({
        contentPrompt: 'New feature',
      })) as string,
    );
    expect(parsed.action).toBe('pipeline_started');
  });
});
