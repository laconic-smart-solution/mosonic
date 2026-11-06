import { ContentStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentService } from '../../content/content.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import { createApproveContentTool } from './approve-content.tool';
import { createGenerateMoreAdaptTool, createGenerateMoreImageTool, createGenerateMoreTranslationTool } from './generate-more.tools';
import { createGetContentTool } from './get-content.tool';
import { createListContentsTool } from './list-contents.tool';
import { createRerunContentNodeTool } from './rerun-content-node.tool';
import { createSaveContentTool } from './save-content.tool';
import * as generateMore from './generate-more.tools';

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
    contentId: 'content-1',
    pipelineRef: 'pipe-1',
    workflowRef: 'wf-1',
    ruleRef: ruleId,
    status: ContentStatus.draft,
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-02T00:00:00.000Z',
    outputs: { text: 'Sale post', image: 'https://img' },
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    contentId: 'content-1',
    pipelineRef: 'pipe-1',
    workflowRef: 'wf-1',
    ruleRef: ruleId,
    status: ContentStatus.draft,
    outputs: { text: 'Sale post', image: 'https://img' },
    userEdits: {},
    ...overrides,
  };
}

function workflows(snapshot: ReturnType<typeof workflowSnapshot> | null = workflowSnapshot()) {
  return {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot),
    getWorkflow: jest.fn().mockResolvedValue(snapshot),
  } as unknown as WorkflowService;
}

function draftService(
  nodes: Array<Record<string, unknown>> = [],
  lanes: string[] = [],
): ContentService {
  return {
    describeDraftNodes: jest.fn().mockResolvedValue({ lanes, nodes }),
    saveContent: jest.fn().mockResolvedValue({ success: true }),
    scheduleRerun: jest.fn().mockImplementation(async (_id: string, dto: { nodeId: string }) => ({
      outputNodeId: dto.nodeId,
      workflowNodeId: dto.nodeId,
      nodeType: 'image_generation',
    })),
  } as unknown as ContentService;
}

describe('list_contents', () => {
  it('lists only this workflow and always sends ruleRef + workflowRef', async () => {
    const findPage = jest.fn().mockResolvedValue({
      data: [pageRow({ contentId: 'c-run' }), pageRow({ contentId: 'c-old', status: ContentStatus.approved })],
      total: 2,
    });
    const contents = { findPage } as unknown as IContentRepository;
    const parsed = JSON.parse(
      (await createListContentsTool(ruleId, workflows(), contents, auth).invoke({})) as string,
    );
    expect(findPage).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ ruleRef: ruleId, workflowRef: 'wf-1' }),
      }),
      auth,
    );
    expect(parsed.contents).toHaveLength(2);
    expect(parsed.contents[0].hasImage).toBe(true);
    expect(parsed.contents[0].textPreview).toBe('Sale post');
  });

  it('returns no_workflow without querying contents', async () => {
    const contents = { findPage: jest.fn() } as unknown as IContentRepository;
    const parsed = JSON.parse(
      (await createListContentsTool(ruleId, workflows(null), contents, auth).invoke({})) as string,
    );
    expect(parsed.code).toBe('no_workflow');
    expect(contents.findPage).not.toHaveBeenCalled();
  });
});

describe('get_content', () => {
  it('returns no_content when this workflow has no drafts', async () => {
    const contents = {
      findPage: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    } as unknown as IContentRepository;
    const parsed = JSON.parse(
      (await createGetContentTool(ruleId, workflows(), contents, draftService(), auth).invoke({})) as string,
    );
    expect(parsed.code).toBe('no_content');
  });

  it('rejects content that belongs to another rule', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record({ ruleRef: 'other-rule' })),
    } as unknown as IContentRepository;
    const parsed = JSON.parse(
      (await createGetContentTool(ruleId, workflows(), contents, draftService(), auth).invoke({
        contentId: 'content-1',
      })) as string,
    );
    expect(parsed.code).toBe('not_found');
  });

  it('shows the latest draft on this workflow', async () => {
    const contents = {
      findPage: jest.fn().mockResolvedValue({ data: [pageRow()], total: 1 }),
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const service = draftService([
      {
        nodeId: 'img-1',
        type: 'image_generation',
        lane: 'linkedin',
        field: 'image',
        preview: 'https://img',
        pending: false,
      },
    ], ['linkedin']);
    const parsed = JSON.parse(
      (await createGetContentTool(ruleId, workflows(), contents, service, auth).invoke({})) as string,
    );
    expect(parsed.action).toBe('show_content');
    expect(parsed.contentId).toBe('content-1');
    expect(parsed.hasImage).toBe(true);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.lanes).toEqual(['linkedin']);
  });
});

describe('save_content', () => {
  it('saves text edits on a draft', async () => {
    const contents = {
      findById: jest.fn()
        .mockResolvedValueOnce(record())
        .mockResolvedValueOnce(record({ userEdits: { text: 'Shorter' } })),
    } as unknown as IContentRepository;
    const contentService = {
      saveContent: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createSaveContentTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        text: 'Shorter',
      })) as string,
    );
    expect(contentService.saveContent).toHaveBeenCalledWith(
      'content-1',
      { userEdits: { text: 'Shorter' } },
      auth,
    );
    expect(parsed.saved).toBe(true);
  });

  it('refuses rejected content', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record({ status: ContentStatus.rejected })),
    } as unknown as IContentRepository;
    const contentService = { saveContent: jest.fn() } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createSaveContentTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        text: 'Nope',
      })) as string,
    );
    expect(parsed.code).toBe('not_editable');
    expect(contentService.saveContent).not.toHaveBeenCalled();
  });

  it('copies a finished node output into nodeUserEdits', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(
        record({
          nodeOutputs: { 'n-text': { text: 'Short caption' } },
          nodeUserEdits: {},
          userEdits: {},
        }),
      ),
    } as unknown as IContentRepository;
    const contentService = {
      saveContent: jest.fn().mockResolvedValue({ success: true }),
      describeDraftNodes: jest.fn().mockResolvedValue({
        lanes: ['facebook'],
        nodes: [
          {
            nodeId: 'n-text',
            type: 'adapt',
            lane: 'facebook',
            field: 'text',
            preview: 'Short caption',
            pending: false,
          },
        ],
      }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createSaveContentTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        fromNodeId: 'n-text',
      })) as string,
    );
    expect(contentService.saveContent).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        userEdits: expect.objectContaining({ text: 'Short caption' }),
        nodeUserEdits: expect.objectContaining({
          'n-text': expect.objectContaining({ text: 'Short caption' }),
        }),
        nodeOutputs: expect.objectContaining({
          'n-text': expect.objectContaining({ text: 'Short caption' }),
        }),
        laneOutputs: expect.objectContaining({
          facebook: expect.objectContaining({ text: 'Short caption' }),
        }),
      }),
      auth,
    );
    expect(parsed.saved).toBe(true);
    expect(parsed.fromNodeId).toBe('n-text');
  });

  it('does not copy a node that is still re-running', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(
        record({
          nodeOutputs: { 'n-text': { text: 'Old', _pending: true } },
        }),
      ),
    } as unknown as IContentRepository;
    const contentService = { saveContent: jest.fn() } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createSaveContentTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        fromNodeId: 'n-text',
      })) as string,
    );
    expect(parsed.code).toBe('not_ready');
    expect(contentService.saveContent).not.toHaveBeenCalled();
  });
});

describe('approve_content', () => {
  it('approves the latest draft on this workflow', async () => {
    const contents = {
      findPage: jest.fn().mockResolvedValue({ data: [pageRow()], total: 1 }),
      findById: jest.fn()
        .mockResolvedValueOnce(record())
        .mockResolvedValueOnce(record({ status: ContentStatus.approved })),
    } as unknown as IContentRepository;
    const contentService = {
      approveContent: jest.fn().mockResolvedValue({ uploadId: 'up-1' }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createApproveContentTool(ruleId, workflows(), contents, contentService, auth).invoke(
        {},
      )) as string,
    );
    expect(parsed.action).toBe('content_approved');
    expect(parsed.uploadId).toBe('up-1');
  });
});

describe('rerun_content_node', () => {
  const imageNode = {
    nodeId: 'node-img',
    type: 'image_generation',
    lane: 'facebook',
    field: 'image',
    preview: 'https://img',
    pending: false,
  };

  it('schedules a keep-scene edit when nodeId is the generated image id', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService([imageNode]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'node-img',
        message: 'darker',
        useBrandLogo: true,
      })) as string,
    );
    expect(contentService.scheduleRerun).toHaveBeenCalledWith(
      'content-1',
      {
        nodeId: 'node-img',
        message: 'darker',
        mode: 'edit',
        useBrandLogo: true,
      },
      auth,
    );
    expect(parsed.action).toBe('content_rerun_started');
    expect(parsed.pendingNodeId).toBe('node-img');
    expect(parsed.pendingNodeType).toBe('image_generation');
  });

  it('turns on useBrandLogo when the follow-up mentions logo', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService([imageNode]);
    await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
      contentId: 'content-1',
      nodeId: 'node-img',
      message: 'use the actual brand logo',
    });
    expect(contentService.scheduleRerun).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        nodeId: 'node-img',
        mode: 'edit',
        useBrandLogo: true,
      }),
      auth,
    );
  });

  it('resolves a bare node type ("image") when this draft has exactly one image', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService([
      { ...imageNode, nodeId: 'node-img-real-id' },
    ]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'image',
      })) as string,
    );
    expect(contentService.scheduleRerun).toHaveBeenCalledWith(
      'content-1',
      {
        nodeId: 'node-img-real-id',
        message: undefined,
        mode: 'edit',
        useBrandLogo: false,
      },
      auth,
    );
    expect(parsed.action).toBe('content_rerun_started');
    expect(parsed.pendingNodeId).toBe('node-img-real-id');
    expect(parsed.pendingNodeType).toBe('image_generation');
  });

  it('asks which image when the draft has more than one', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService([
      imageNode,
      { ...imageNode, nodeId: 'img-extra', lane: null, preview: 'https://extra' },
    ]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'image',
      })) as string,
    );
    expect(parsed.action).toBe('ask_user');
    expect(parsed.options).toHaveLength(2);
    expect(contentService.scheduleRerun).not.toHaveBeenCalled();
  });

  it('asks which channel when several text nodes exist', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService(
      [
        {
          nodeId: 'adapt-fb',
          type: 'adapt',
          lane: 'facebook',
          field: 'text',
          preview: 'FB copy',
          pending: false,
        },
        {
          nodeId: 'adapt-li',
          type: 'adapt',
          lane: 'linkedin',
          field: 'text',
          preview: 'LI copy',
          pending: false,
        },
      ],
      ['facebook', 'linkedin'],
    );
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'text',
        message: 'make it shorter',
      })) as string,
    );
    expect(parsed.action).toBe('ask_user');
    expect(parsed.options.map((option: { id: string }) => option.id)).toEqual([
      'adapt-fb',
      'adapt-li',
      'all',
    ]);
    expect(contentService.scheduleRerun).not.toHaveBeenCalled();
  });

  it('reports node_not_found instead of guessing when nothing matches', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = draftService([
      {
        nodeId: 'node-text-real-id',
        type: 'text_generation',
        lane: null,
        field: 'text',
        preview: 'Hello',
        pending: false,
      },
    ]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: '53d2abea-6eeb-415a-908a-a4a26b',
      })) as string,
    );
    expect(contentService.scheduleRerun).not.toHaveBeenCalled();
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('node_not_found');
  });
});

describe('generate_more', () => {
  it('starts an extra image on this draft', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = {
      scheduleGenerateNode: jest.fn().mockResolvedValue({ success: true, nodeId: 'gen-1' }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createGenerateMoreImageTool({
        ruleId,
        workflowService: workflows(),
        contents,
        contentService,
        auth,
      }).invoke({
        contentId: 'content-1',
        lane: 'linkedin',
        message: 'product shot',
      })) as string,
    );
    expect(contentService.scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.ImageGeneration,
        message: 'product shot',
        config: expect.objectContaining({ laneId: 'linkedin', channel: 'linkedin' }),
      }),
      auth,
    );
    expect(parsed.action).toBe('generate_more_started');
    expect(parsed.pendingNodeType).toBe(WorkflowNodeType.ImageGeneration);
  });

  it('starts an extra channel caption on this draft', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = {
      scheduleGenerateNode: jest.fn().mockResolvedValue({ success: true, nodeId: 'gen-adapt' }),
      describeDraftNodes: jest.fn().mockResolvedValue({ lanes: ['facebook'], nodes: [] }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createGenerateMoreAdaptTool({
        ruleId,
        workflowService: workflows(),
        contents,
        contentService,
        auth,
      }).invoke({
        contentId: 'content-1',
        lane: 'instagram',
        message: 'shorter and punchier',
      })) as string,
    );
    expect(contentService.scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.Adapt,
        message: 'shorter and punchier',
        config: expect.objectContaining({ laneId: 'instagram', channel: 'instagram' }),
      }),
      auth,
    );
    expect(parsed.action).toBe('generate_more_started');
    expect(parsed.pendingNodeType).toBe(WorkflowNodeType.Adapt);
  });

  it('refuses a channel caption that already exists on the draft', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = {
      scheduleGenerateNode: jest.fn(),
      syncUploadLane: jest.fn().mockResolvedValue(undefined),
      describeDraftNodes: jest.fn().mockResolvedValue({ lanes: ['facebook'], nodes: [] }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createGenerateMoreAdaptTool({
        ruleId,
        workflowService: workflows(),
        contents,
        contentService,
        auth,
      }).invoke({
        contentId: 'content-1',
        lane: 'facebook',
      })) as string,
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('lane_taken');
    expect(contentService.scheduleGenerateNode).not.toHaveBeenCalled();
    expect(contentService.syncUploadLane).toHaveBeenCalledWith(
      'content-1',
      'facebook',
      auth,
    );
  });

  it('starts an extra translation', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record()),
    } as unknown as IContentRepository;
    const contentService = {
      scheduleGenerateNode: jest.fn().mockResolvedValue({ success: true, nodeId: 'gen-2' }),
    } as unknown as ContentService;
    const parsed = JSON.parse(
      (await createGenerateMoreTranslationTool({
        ruleId,
        workflowService: workflows(),
        contents,
        contentService,
        auth,
      }).invoke({
        contentId: 'content-1',
        targetLanguage: 'th',
      })) as string,
    );
    expect(parsed.pendingNodeType).toBe(WorkflowNodeType.Translation);
  });

  it('does not export a video generate-more tool', () => {
    expect('createGenerateMoreVideoTool' in generateMore).toBe(false);
  });
});

describe('content previews and rejected drafts', () => {
  it('reports hasImage when only nodeOutputs has the image (I-10)', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(
        record({
          outputs: { text: 'Iced latte' },
          nodeOutputs: { 'node-img': { image: 'https://files/x.png' } },
        }),
      ),
    } as unknown as IContentRepository;
    const parsed = JSON.parse(
      (await createGetContentTool(ruleId, workflows(), contents, draftService(), auth).invoke({
        contentId: 'content-1',
      })) as string,
    );
    expect(parsed.hasImage).toBe(true);
  });

  it('re-runs a rejected draft and puts it back to draft (I-08)', async () => {
    const updateStatus = jest.fn().mockResolvedValue(undefined);
    const contents = {
      findById: jest.fn().mockResolvedValue(record({ status: ContentStatus.rejected })),
      updateStatus,
    } as unknown as IContentRepository;
    const contentService = draftService([
      {
        nodeId: 'node-text',
        type: 'text_generation',
        lane: null,
        field: 'text',
        preview: 'Old copy',
        pending: false,
      },
    ]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'text',
        message: 'pure Thai',
      })) as string,
    );
    expect(updateStatus).toHaveBeenCalledWith('content-1', ContentStatus.draft, auth);
    expect(contentService.scheduleRerun).toHaveBeenCalled();
    expect(parsed).toMatchObject({
      action: 'content_rerun_started',
      status: ContentStatus.draft,
      reopened: true,
    });
  });

  it.skip('approved content is now re-runnable (see content-scope EDITABLE)', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue(record({ status: ContentStatus.approved })),
      updateStatus: jest.fn(),
    } as unknown as IContentRepository;
    const contentService = draftService([]);
    const parsed = JSON.parse(
      (await createRerunContentNodeTool(ruleId, workflows(), contents, contentService, auth).invoke({
        contentId: 'content-1',
        nodeId: 'text',
      })) as string,
    );
    expect(parsed.code).toBe('not_editable');
    expect(contentService.scheduleRerun).not.toHaveBeenCalled();
  });
});

