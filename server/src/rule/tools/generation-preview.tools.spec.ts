import type { TenancyAuth } from '../../auth/tenancy.types';
import type { WorkflowService } from '../../workflow/workflow.service';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { WorkflowHeygenService } from '../../workflow/workflow-heygen.service';
import {
  buildGenerationPreview,
  createDescribeNodeConfigFieldsTool,
  createGetDraftMediaStatusTool,
  createPreviewGenerationTool,
  draftMediaOutcomes,
  generationPreviewPrompt,
  PREVIEW_CONFIRM_OPTION_ID,
} from './generation-preview.tools';
import { createListHeygenVoicesTool } from './video-look.tools';
import { createStartGenerationTool } from './start-generation.tool';
import { confirmationPromptFor, confirmedPlanChain, isConfirmedByUser } from './tool-guards.util';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

const nodes = [
  { nodeId: 'n-text', type: 'text_generation', order: 1, config: { tone: 'friendly', customPrompt: 'secret' } },
  { nodeId: 'n-img', type: 'image_generation', order: 2, lane: 'instagram', config: { style: 'watercolor', aspectRatio: '1:1' } },
  { nodeId: 'n-pres', type: 'video_presenter', order: 3, lane: 'tiktok', config: { mode: 'presenter', duration: 30, heygenAvatarId: 'look-1' } },
  { nodeId: 'n-tr', type: 'translation', order: 4, config: { targetLanguage: 'th' } },
];

function snapshot() {
  return { workflow: { workflowId: 'wf-1', name: 'W', status: 'ready', ruleRef: ruleId }, nodes, edges: [] };
}

function wfService() {
  return {
    getWorkflowByRuleId: jest.fn().mockResolvedValue(snapshot()),
    getWorkflow: jest.fn().mockResolvedValue(snapshot()),
  } as unknown as WorkflowService;
}

describe('buildGenerationPreview', () => {
  it('lists steps in order with lanes, typed settings and video issues', () => {
    const p = buildGenerationPreview(nodes);
    expect(p.steps.map((s) => s.nodeId)).toEqual(['n-text', 'n-img', 'n-pres', 'n-tr']);
    expect(p.lanes).toEqual(['instagram', 'tiktok']);
    expect(p.videoSteps).toBe(1);
    expect(p.steps[0].settings).toEqual({ tone: 'friendly' });
    expect(p.steps[2].settings).toMatchObject({ duration: 30, heygenAvatarId: 'look-1' });
    expect(p.steps[2].issue).toBeTruthy(); // presenter without a voice
    expect(p.lines.join('\n')).toContain('look look-1, 30s');
    expect(p.lines.join('\n')).toContain('to th');
  });
});

describe('generationPreviewPrompt', () => {
  it('is an ask_user card bound to start_generation with a Start option', () => {
    const out = JSON.parse(generationPreviewPrompt({ topic: 'Launch', preview: buildGenerationPreview(nodes) }));
    expect(out.action).toBe('ask_user');
    expect(out.confirmFor).toBe('start_generation');
    expect(out.options[0].id).toBe(PREVIEW_CONFIRM_OPTION_ID);
    expect(out.question).toContain('Ready to generate "Launch"?');
    expect(out.estimate.images).toBe(1);
    expect(out.estimate.credits).toBeGreaterThanOrEqual(1);
    expect(out.preview.steps.some((s: { badge?: string }) => s.badge === 'updated')).toBe(true);
  });

  it('Start on the card confirms the plan chain; Change does not', () => {
    const card = generationPreviewPrompt({ topic: 'Launch', preview: buildGenerationPreview(nodes) });
    const history = (reply: string) => [
      { role: 'user', content: 'make a post' },
      { role: 'assistant', content: 'Ready?', steps: [{ type: 'observation', name: 'start_generation', result: card }] },
      { role: 'user', content: reply },
    ];
    expect(confirmedPlanChain(history('User choice: start_post (Start)'))?.has('start_generation')).toBe(true);
    expect(isConfirmedByUser(history('User choice: change (Change settings)'))).toBe(true);
    expect(confirmedPlanChain(history('User choice: change (Change settings)'))).toBeNull();
  });
});

describe('start_generation preview gate', () => {
  const orchestration = { startPipeline: jest.fn().mockResolvedValue({ pipelineId: 'p-1' }) };
  beforeEach(() => orchestration.startPipeline.mockClear());

  it('returns the preview card and starts nothing when not confirmed', async () => {
    const t = createStartGenerationTool(ruleId, wfService(), orchestration as never, auth, undefined, {
      previewGate: { confirmed: false },
    });
    const out = JSON.parse(await t.invoke({ contentPrompt: 'Launch day' }));
    expect(out.code).toBe('preview_confirm');
    expect(out.preview.steps).toHaveLength(4);
    expect(orchestration.startPipeline).not.toHaveBeenCalled();
  });

  it('starts once the user tapped Start', async () => {
    const t = createStartGenerationTool(ruleId, wfService(), orchestration as never, auth, undefined, {
      previewGate: { confirmed: true },
    });
    const out = JSON.parse(await t.invoke({ contentPrompt: 'Launch day' }));
    expect(out.action).toBe('pipeline_started');
    expect(orchestration.startPipeline).toHaveBeenCalledTimes(1);
  });

  it('no gate keeps the old behaviour', async () => {
    const t = createStartGenerationTool(ruleId, wfService(), orchestration as never, auth);
    const out = JSON.parse(await t.invoke({ contentPrompt: 'Launch day' }));
    expect(out.action).toBe('pipeline_started');
  });
});

describe('read tools', () => {
  it('preview_generation returns the plan', async () => {
    const out = JSON.parse(await createPreviewGenerationTool(ruleId, wfService(), auth).invoke({}));
    expect(out.ok).toBe(true);
    expect(out.steps).toHaveLength(4);
  });

  it('describe_node_config_fields lists typed keys with current values', async () => {
    const t = createDescribeNodeConfigFieldsTool(ruleId, wfService(), auth);
    const img = JSON.parse(await t.invoke({ nodeId: 'n-img' }));
    expect(img.fields).toEqual(expect.arrayContaining([{ key: 'style', kind: 'string', value: 'watercolor' }]));
    const vid = JSON.parse(await t.invoke({ nodeId: 'n-pres' }));
    expect(vid.fields).toEqual(expect.arrayContaining([{ key: 'duration', kind: 'int', value: 30 }]));
    const missing = JSON.parse(await t.invoke({ nodeId: 'nope' }));
    expect(missing.ok).toBe(false);
  });

  it('draftMediaOutcomes classifies ready / pending / failed', () => {
    const typeOf = (id: string) => (id.startsWith('n-pres') ? 'video_presenter' : id === 'n-img' ? 'image_generation' : 'text_generation');
    const out = draftMediaOutcomes(
      {
        'n-pres-tiktok': { video: 'https://v/1.mp4' },
        'n-pres': { error: 'HeyGen quota' },
        'n-img': { _pending: true },
        'n-text': { text: 'hi' },
      },
      typeOf,
    );
    expect(out).toEqual([
      { nodeId: 'n-pres-tiktok', type: 'video_presenter', status: 'ready', url: 'https://v/1.mp4' },
      { nodeId: 'n-pres', type: 'video_presenter', status: 'failed', error: 'HeyGen quota' },
      { nodeId: 'n-img', type: 'image_generation', status: 'pending' },
    ]);
  });

  it('get_draft_media_status reads the latest draft', async () => {
    const contents = {
      findById: jest.fn().mockResolvedValue({
        contentId: 'c-1', ruleRef: ruleId, workflowRef: 'wf-1', status: 'draft',
        nodeOutputs: { 'n-pres': { error: 'boom' } },
      }),
    } as unknown as IContentRepository;
    const out = JSON.parse(await createGetDraftMediaStatusTool(ruleId, wfService(), contents, auth).invoke({ contentId: 'c-1' }));
    expect(out.media[0]).toMatchObject({ nodeId: 'n-pres', status: 'failed' });
    expect(out.hint).toContain('retry');
  });

  it('list_heygen_voices maps voices', async () => {
    const heygen = { listVoicesPage: jest.fn().mockResolvedValue({ voices: [{ voiceId: 'v1', name: 'Ann', language: 'English', gender: 'female' }], hasMore: false }) };
    const out = JSON.parse(await createListHeygenVoicesTool({ heygen: heygen as unknown as WorkflowHeygenService }).invoke({ language: 'English' }));
    expect(out.voices).toEqual([{ voiceId: 'v1', name: 'Ann', language: 'English', gender: 'female' }]);
    expect(heygen.listVoicesPage).toHaveBeenCalledWith({ language: 'English', limit: 15 });
  });
});

describe('video confirm card preview', () => {
  it('lists the requested video settings', () => {
    const out = JSON.parse(confirmationPromptFor('generate_cinematic_video', { duration: 10, cinematicMode: 'heygen_video', aspectRatio: '9:16' }));
    expect(out.question).toContain('Duration (s): 10');
    expect(out.question).toContain('Mode: heygen_video');
    expect(out.question).toContain('Aspect: 9:16');
  });
});