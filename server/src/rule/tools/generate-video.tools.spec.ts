/**
 * Chat video tools. Everything below is mocked: scheduleGenerateNode is a jest.fn,
 * so no HeyGen / OpenAI request can be made from these tests.
 */
import { ContentStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentService } from '../../content/content.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowService } from '../../workflow/workflow.service';
import {
  createGenerateCinematicVideoTool,
  createGeneratePresenterVideoTool,
  presenterSetupMissing,
} from './generate-more.tools';
import { CONFIRMATION_REQUIRED_TOOL_NAMES, confirmationPromptFor } from './tool-guards.util';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function snapshot(nodes: Array<Record<string, unknown>> = []) {
  return {
    workflow: { workflowId: 'wf-1', name: 'Campaign', status: 'ready', ruleRef: ruleId },
    nodes,
    edges: [],
  };
}

function setup(nodes: Array<Record<string, unknown>> = []) {
  const workflowService = {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot(nodes)),
    getWorkflow: jest.fn().mockResolvedValue(snapshot(nodes)),
  } as unknown as WorkflowService;
  const contents = {
    findById: jest.fn().mockResolvedValue({
      contentId: 'content-1',
      pipelineRef: 'pipe-1',
      workflowRef: 'wf-1',
      ruleRef: ruleId,
      status: ContentStatus.draft,
      outputs: { text: 'Sale post' },
      userEdits: {},
    }),
  } as unknown as IContentRepository;
  const scheduleGenerateNode = jest.fn().mockResolvedValue({ success: true, nodeId: 'vid-1' });
  const contentService = { scheduleGenerateNode } as unknown as ContentService;
  const deps = { ruleId, workflowService, contents, contentService, auth };
  return { deps, scheduleGenerateNode };
}

const presenterNode = {
  nodeId: 'p1',
  type: WorkflowNodeType.VideoPresenter,
  config: { mode: 'presenter', heygenAvatarId: 'av-1', heygenVoiceId: 'vo-1', heygenExpressiveness: 'high' },
};

describe('generate_presenter_video', () => {
  it('schedules a presenter node with the workflow avatar/voice, portrait by default', async () => {
    const { deps, scheduleGenerateNode } = setup([presenterNode]);
    const parsed = JSON.parse(
      (await createGeneratePresenterVideoTool(deps).invoke({ contentId: 'content-1', lane: 'instagram' })) as string,
    );
    expect(scheduleGenerateNode).toHaveBeenCalledTimes(1);
    expect(scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.VideoPresenter,
        config: expect.objectContaining({
          mode: 'presenter',
          heygenAvatarId: 'av-1',
          heygenVoiceId: 'vo-1',
          heygenExpressiveness: 'high',
          heygenOrientation: 'portrait',
          laneId: 'instagram',
        }),
      }),
      auth,
    );
    expect(parsed.action).toBe('generate_more_started');
    expect(parsed.pendingNodeType).toBe(WorkflowNodeType.VideoPresenter);
  });

  it('reads avatar/voice from a legacy presenter-mode node too', async () => {
    const { deps, scheduleGenerateNode } = setup([
      { ...presenterNode, type: WorkflowNodeType.VideoGeneration },
    ]);
    await createGeneratePresenterVideoTool(deps).invoke({ contentId: 'content-1', orientation: 'landscape' });
    expect(scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.VideoPresenter,
        config: expect.objectContaining({ heygenAvatarId: 'av-1', heygenOrientation: 'landscape' }),
      }),
      auth,
    );
  });

  it('returns presenter_setup_required and schedules nothing without avatar and voice', async () => {
    const { deps, scheduleGenerateNode } = setup([]);
    const parsed = JSON.parse(
      (await createGeneratePresenterVideoTool(deps).invoke({ contentId: 'content-1' })) as string,
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('presenter_setup_required');
    expect(scheduleGenerateNode).not.toHaveBeenCalled();
  });

  it('lists exactly what is missing', () => {
    expect(presenterSetupMissing({})).toEqual(['avatar', 'voice']);
    expect(presenterSetupMissing({ heygenAvatarId: 'a' })).toEqual(['voice']);
    expect(presenterSetupMissing({ heygenAvatarId: 'a', heygenVoiceId: 'v' })).toEqual([]);
  });
});

const cinematicNode = {
  nodeId: 'c1',
  type: WorkflowNodeType.VideoCinematic,
  config: {
    mode: 'cinematic',
    cinematicMode: 'cinematic_avatar',
    heygenAvatarId: 'av-cin-1',
  },
};

describe('generate_cinematic_video', () => {
  it('schedules a cinematic node, 9:16 for Instagram', async () => {
    const { deps, scheduleGenerateNode } = setup([cinematicNode]);
    await createGenerateCinematicVideoTool(deps).invoke({
      contentId: 'content-1',
      lane: 'instagram',
      duration: 10,
    });
    expect(scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.VideoCinematic,
        config: expect.objectContaining({
          mode: 'cinematic',
          cinematicMode: 'cinematic_avatar',
          aspectRatio: '9:16',
          duration: 10,
          heygenAvatarId: 'av-cin-1',
        }),
      }),
      auth,
    );
  });

  it('keeps an explicit aspect ratio and leaves other lanes on the node default', async () => {
    const { deps, scheduleGenerateNode } = setup([cinematicNode]);
    await createGenerateCinematicVideoTool(deps).invoke({ contentId: 'content-1', lane: 'youtube' });
    const config = scheduleGenerateNode.mock.calls[0][1].config as Record<string, unknown>;
    expect(config.aspectRatio).toBeUndefined();
    await createGenerateCinematicVideoTool(deps).invoke({
      contentId: 'content-1',
      lane: 'instagram',
      aspectRatio: '16:9',
    });
    expect((scheduleGenerateNode.mock.calls[1][1].config as Record<string, unknown>).aspectRatio).toBe('16:9');
  });

  it('returns cinematic_avatar_required without a look', async () => {
    const { deps, scheduleGenerateNode } = setup([]);
    const parsed = JSON.parse(
      (await createGenerateCinematicVideoTool(deps).invoke({ contentId: 'content-1' })) as string,
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('cinematic_avatar_required');
    expect(scheduleGenerateNode).not.toHaveBeenCalled();
  });

  it('allows heygen_video mode without an avatar look', async () => {
    const { deps, scheduleGenerateNode } = setup([]);
    await createGenerateCinematicVideoTool(deps).invoke({
      contentId: 'content-1',
      cinematicMode: 'heygen_video',
      heygenVideoMode: 'text_to_video',
    });
    expect(scheduleGenerateNode).toHaveBeenCalledWith(
      'content-1',
      expect.objectContaining({
        type: WorkflowNodeType.VideoCinematic,
        config: expect.objectContaining({
          mode: 'cinematic',
          cinematicMode: 'heygen_video',
          heygenVideoMode: 'text_to_video',
        }),
      }),
      auth,
    );
  });
});

describe('video tools need confirmation', () => {
  it.each(['generate_presenter_video', 'generate_cinematic_video'])('%s asks first', (name) => {
    expect(CONFIRMATION_REQUIRED_TOOL_NAMES.has(name)).toBe(true);
    const prompt = JSON.parse(confirmationPromptFor(name));
    expect(prompt.action).toBe('ask_user');
    expect(prompt.confirmFor).toBe(name);
    expect(prompt.question).toMatch(/video/i);
  });
});
