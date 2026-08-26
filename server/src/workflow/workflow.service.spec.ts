jest.mock('../rule/rule.service', () => ({
  RuleService: class RuleService {},
}));

import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/schemas/user.schema';
import type { TenancyAuth } from '../auth/tenancy.types';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { WorkflowStatus } from './schemas/workflow.schema';
import { WorkflowService } from './workflow.service';

describe('WorkflowService.findPage', () => {
  const auth: TenancyAuth = { userId: 'u1', role: UserRole.CUSTOMER };

  function makeService(deps: {
    findRows: unknown[];
    total: number;
    distinctRefs?: string[];
    nodeRows?: Array<{ workflowRef: string; type: string }>;
  }) {
    const workflowModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue(deps.findRows),
                }),
              }),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(deps.total),
      }),
    };
    const workflowNodeModel = {
      distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(deps.distinctRefs ?? []),
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(deps.nodeRows ?? []),
          }),
        }),
      }),
      deleteMany: jest.fn(),
      create: jest.fn(),
    };
    const workflowGeneration = {} as never;
    const llm = {} as never;
    const ruleService = {} as never;
    const events = {} as never;

    const service = new WorkflowService(
      workflowModel as never,
      workflowNodeModel as never,
      workflowGeneration,
      llm,
      ruleService,
      events,
    );
    return { service, workflowModel, workflowNodeModel };
  }

  it('returns empty data and zero total when nodeType filter matches no nodes', async () => {
    const { service, workflowModel } = makeService({
      findRows: [],
      total: 0,
      distinctRefs: [],
    });

    const out = await service.findPage(
      {
        page: 1,
        limit: 10,
        filter: { nodeType: WorkflowNodeType.TextGeneration },
      },
      auth,
    );

    expect(out).toEqual({ data: [], total: 0 });
    expect(workflowModel.find).not.toHaveBeenCalled();
  });

  it('applies name search and returns nodeTypes for workflows on the page', async () => {
    const wf1 = {
      workflowId: 'wf-1',
      ruleRef: 'rule-a',
      name: 'Alpha workflow',
      status: WorkflowStatus.Ready,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const { service, workflowModel, workflowNodeModel } = makeService({
      findRows: [wf1],
      total: 1,
      distinctRefs: ['wf-1'],
      nodeRows: [
        { workflowRef: 'wf-1', type: WorkflowNodeType.TextGeneration },
        { workflowRef: 'wf-1', type: WorkflowNodeType.ImageGeneration },
      ],
    });

    const out = await service.findPage(
      {
        page: 1,
        limit: 10,
        filter: { q: 'alpha', nodeType: WorkflowNodeType.TextGeneration },
      },
      auth,
    );

    expect(workflowModel.find).toHaveBeenCalled();
    expect(workflowNodeModel.distinct).toHaveBeenCalled();
    expect(out.total).toBe(1);
    expect(out.data).toHaveLength(1);
    expect(out.data[0]).toMatchObject({
      workflowId: 'wf-1',
      ruleRef: 'rule-a',
      name: 'Alpha workflow',
      status: WorkflowStatus.Ready,
    });
    expect(out.data[0].nodeTypes.sort()).toEqual(
      [
        WorkflowNodeType.TextGeneration,
        WorkflowNodeType.ImageGeneration,
      ].sort(),
    );
    expect(out.data[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('loads workflows without node filter when only search q is set', async () => {
    const { service, workflowNodeModel } = makeService({
      findRows: [
        {
          workflowId: 'wf-2',
          ruleRef: 'rule-b',
          name: 'Beta',
          status: WorkflowStatus.Generating,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 3,
      nodeRows: [],
    });

    const out = await service.findPage(
      { page: 1, limit: 10, filter: { q: 'eta' } },
      auth,
    );

    expect(workflowNodeModel.distinct).not.toHaveBeenCalled();
    expect(out.total).toBe(3);
    expect(out.data[0].workflowId).toBe('wf-2');
  });
});

describe('WorkflowService.saveNodesForRule', () => {
  const auth: TenancyAuth = { userId: 'u1', role: UserRole.CUSTOMER };
  const ruleId = 'rule-1';
  const saveBody = {
    nodes: [
      {
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: false,
      },
    ],
  };

  function makeSaveByRuleService(
    existingWorkflow: { workflowId: string } | null,
  ) {
    const findOneExec = jest.fn().mockResolvedValue(existingWorkflow);
    const workflowModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: findOneExec,
        }),
      }),
      create: jest.fn().mockResolvedValue({
        workflowId: 'wf-new',
        ruleRef: ruleId,
        status: WorkflowStatus.Ready,
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    };
    const workflowNodeModel = {
      deleteMany: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      findOneAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const ruleService = {
      getRuleById: jest.fn().mockResolvedValue({ ruleId }),
    };
    const service = new WorkflowService(
      workflowModel as never,
      workflowNodeModel as never,
      {} as never,
      {} as never,
      ruleService as never,
      {} as never,
    );
    const saveNodesSpy = jest
      .spyOn(service, 'saveNodes')
      .mockResolvedValue({ success: true });
    return { service, workflowModel, ruleService, saveNodesSpy };
  }

  it('creates a ready workflow when none exists, then saves nodes', async () => {
    const { service, workflowModel, ruleService, saveNodesSpy } =
      makeSaveByRuleService(null);

    const out = await service.saveNodesForRule(
      ruleId,
      { ...saveBody, name: 'My workflow' },
      auth,
    );

    expect(ruleService.getRuleById).toHaveBeenCalledWith(ruleId, auth);
    expect(workflowModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My workflow',
        ruleRef: ruleId,
        userId: auth.userId,
        status: WorkflowStatus.Ready,
      }),
    );
    expect(saveNodesSpy).toHaveBeenCalledWith('wf-new', saveBody, auth);
    expect(out).toEqual({ workflowId: 'wf-new', success: true });
  });

  it('reuses existing workflow for the rule', async () => {
    const { service, workflowModel, saveNodesSpy } = makeSaveByRuleService({
      workflowId: 'wf-existing',
    });

    const out = await service.saveNodesForRule(ruleId, saveBody, auth);

    expect(workflowModel.create).not.toHaveBeenCalled();
    expect(saveNodesSpy).toHaveBeenCalledWith('wf-existing', saveBody, auth);
    expect(out).toEqual({ workflowId: 'wf-existing', success: true });
  });
});

describe('WorkflowService.updateWorkflow', () => {
  const auth: TenancyAuth = { userId: 'u1', role: UserRole.CUSTOMER };

  function makeUpdateService(existing: { workflowId: string } | null) {
    const updateOneExec = jest.fn().mockResolvedValue({});
    const workflowModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      }),
      updateOne: jest.fn().mockReturnValue({ exec: updateOneExec }),
    };
    const service = new WorkflowService(
      workflowModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, workflowModel, updateOneExec };
  }

  it('updates workflow name', async () => {
    const { service, workflowModel } = makeUpdateService({
      workflowId: 'wf-1',
    });

    const out = await service.updateWorkflow(
      'wf-1',
      { name: '  Renamed  ' },
      auth,
    );

    expect(workflowModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf-1' }),
      { $set: { name: 'Renamed' } },
    );
    expect(out).toEqual({ workflowId: 'wf-1', name: 'Renamed' });
  });

  it('uses Untitled Workflow when name is empty after trim', async () => {
    const { service, workflowModel } = makeUpdateService({
      workflowId: 'wf-1',
    });

    const out = await service.updateWorkflow('wf-1', { name: '   ' }, auth);

    expect(workflowModel.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: { name: 'Untitled Workflow' },
    });
    expect(out.name).toBe('Untitled Workflow');
  });

  it('throws when workflow is not found', async () => {
    const { service } = makeUpdateService(null);

    await expect(
      service.updateWorkflow('wf-missing', { name: 'X' }, auth),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
