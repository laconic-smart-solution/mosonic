import type { TenancyAuth } from '../../auth/tenancy.types';
import { preflightVideoNode } from '../../nodes/video-node-preflight.util';
import type { WorkflowHeygenService } from '../../workflow/workflow-heygen.service';
import type { WorkflowService } from '../../workflow/workflow.service';
import {
  createListHeygenLooksTool,
  createSetVideoNodeLookTool,
  type VideoLookToolDeps,
} from './video-look.tools';

const auth = { userId: 'user-1', role: 'CUSTOMER' } as unknown as TenancyAuth;
const ruleId = 'rule-1';

function workflow() {
  return {
    workflow: { workflowId: 'wf-1', name: 'W', status: 'ready', ruleRef: ruleId },
    nodes: [
      { nodeId: 'n-cin', type: 'video_cinematic', order: 3, isLocked: false, config: { mode: 'cinematic' } },
      { nodeId: 'n-img', type: 'image_generation', order: 2, isLocked: false, config: {} },
    ],
    edges: [],
  };
}

const portrait = {
  ruleAssetId: 'asset-1',
  type: 'reference_image',
  status: 'ready',
  mimeType: 'image/png',
  fileUrl: 'https://files.example/portrait.png',
  originalFileName: 'ceo-portrait.png',
  aiDescription: 'Portrait of the founder',
};

function deps(overrides: Partial<VideoLookToolDeps> = {}) {
  const heygen = {
    listAvatarLooksForUser: jest.fn().mockResolvedValue([{ lookId: 'look-1', name: 'Me' }]),
    listAccountLooks: jest.fn().mockResolvedValue([]),
    setVideoNodeLook: jest.fn().mockResolvedValue({
      lookId: 'new-look',
      lookIds: ['new-look'],
      createdFromRuleAssetId: 'asset-1',
      config: { mode: 'cinematic', heygenAvatarId: 'new-look', heygenAvatarIds: ['new-look'] },
    }),
  };
  const d: VideoLookToolDeps = {
    ruleId,
    workflowService: {
      getWorkflowByRuleId: jest.fn().mockResolvedValue(workflow()),
    } as unknown as WorkflowService,
    heygen: heygen as unknown as WorkflowHeygenService,
    listRuleAssets: jest.fn().mockResolvedValue([portrait, { ...portrait, ruleAssetId: 'pdf', mimeType: 'application/pdf' }]),
    assetFetchUrls: jest.fn().mockReturnValue(['https://files.example/portrait.png']),
    auth,
    ...overrides,
  };
  return { d, heygen };
}

describe('list_heygen_looks', () => {
  it('lists saved looks, brand portraits and current video-step looks', async () => {
    const { d } = deps();
    const out = JSON.parse((await createListHeygenLooksTool(d).invoke({})) as string);
    expect(out.ok).not.toBe(false);
    const body = out.data ?? out;
    expect(body.savedLooks).toEqual([{ lookId: 'look-1', name: 'Me', previewImageUrl: null }]);
    expect(body.brandPortraits.map((a: { ruleAssetId: string }) => a.ruleAssetId)).toEqual(['asset-1']);
    expect(body.videoNodes).toEqual([
      { nodeId: 'n-cin', type: 'video_cinematic', lookId: null, lookIds: [], sourceRuleAssetId: null },
    ]);
  });
});

describe('set_video_node_look', () => {
  it('creates a look from a brand portrait and binds it to the cinematic node', async () => {
    const { d, heygen } = deps();
    const out = JSON.parse(
      (await createSetVideoNodeLookTool(d).invoke({ nodeId: 'n-cin', ruleAssetId: 'asset-1' })) as string,
    );
    const body = out.data ?? out;
    expect(body.lookId).toBe('new-look');
    expect(heygen.setVideoNodeLook).toHaveBeenCalledWith(
      'wf-1',
      'n-cin',
      expect.objectContaining({
        source: expect.objectContaining({
          ruleAssetId: 'asset-1',
          imageUrls: ['https://files.example/portrait.png'],
          name: 'ceo-portrait',
        }),
      }),
      auth,
    );
    expect(preflightVideoNode('video_cinematic', body.config)).toEqual({ ok: true });
  });

  it('sets an existing look id', async () => {
    const { d, heygen } = deps();
    await createSetVideoNodeLookTool(d).invoke({ nodeId: 'n-cin', lookId: 'look-1' });
    expect(heygen.setVideoNodeLook).toHaveBeenCalledWith(
      'wf-1',
      'n-cin',
      expect.objectContaining({ lookId: 'look-1' }),
      auth,
    );
  });

  it('rejects non-video nodes and ambiguous args', async () => {
    const { d, heygen } = deps();
    const wrongType = JSON.parse(
      (await createSetVideoNodeLookTool(d).invoke({ nodeId: 'n-img', lookId: 'look-1' })) as string,
    );
    expect(JSON.stringify(wrongType)).toContain('invalid_config');
    const both = JSON.parse(
      (await createSetVideoNodeLookTool(d).invoke({ nodeId: 'n-cin', lookId: 'a', ruleAssetId: 'asset-1' })) as string,
    );
    expect(JSON.stringify(both)).toContain('bad_request');
    expect(heygen.setVideoNodeLook).not.toHaveBeenCalled();
  });

  it('rejects a brand asset that is not an image', async () => {
    const { d } = deps();
    const out = await createSetVideoNodeLookTool(d).invoke({ nodeId: 'n-cin', ruleAssetId: 'pdf' });
    expect(String(out)).toContain('bad_request');
  });
});
