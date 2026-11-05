import { WorkflowNodeType } from './workflow-node-llm.enums';
import {
  coerceVideoConfigForPersist,
  defaultWorkflowNodeConfigForRule,
  parseWorkflowNodeConfig,
} from './workflow-node-config.zod';

const instagram = { channels: [{ channel: 'instagram' }] };

describe('workflow node config: split video types', () => {
  it('gives presenter nodes portrait HeyGen defaults', () => {
    const cfg = defaultWorkflowNodeConfigForRule(WorkflowNodeType.VideoPresenter) as Record<string, unknown>;
    expect(cfg.mode).toBe('presenter');
    expect(cfg.heygenOrientation).toBe('portrait');
    expect(cfg.aspectRatio).toBe('9:16');
  });

  it('gives cinematic nodes HeyGen 16:9 defaults, and 9:16 for Instagram', () => {
    const plain = defaultWorkflowNodeConfigForRule(WorkflowNodeType.VideoCinematic) as Record<string, unknown>;
    expect(plain.mode).toBe('cinematic');
    expect(plain.cinematicMode).toBe('cinematic_avatar');
    expect(plain.model).toBe('heygen_video_1');
    expect(plain.duration).toBe(10);
    expect(plain.aspectRatio).toBe('16:9');
    const ig = defaultWorkflowNodeConfigForRule(WorkflowNodeType.VideoCinematic, instagram) as Record<string, unknown>;
    expect(ig.aspectRatio).toBe('9:16');
  });

  it('keeps presenter portrait for Instagram', () => {
    const ig = defaultWorkflowNodeConfigForRule(WorkflowNodeType.VideoPresenter, instagram) as Record<string, unknown>;
    expect(ig.heygenOrientation).toBe('portrait');
    expect(ig.aspectRatio).toBe('9:16');
  });

  it('pins mode to the split type when parsing', () => {
    const p = parseWorkflowNodeConfig(WorkflowNodeType.VideoPresenter, { mode: 'cinematic' });
    expect(p.ok && (p.data as Record<string, unknown>).mode).toBe('presenter');
    const c = parseWorkflowNodeConfig(WorkflowNodeType.VideoCinematic, { mode: 'presenter' });
    expect(c.ok && (c.data as Record<string, unknown>).mode).toBe('cinematic');
  });

  it('still parses legacy video_generation by config.mode', () => {
    const legacy = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, { mode: 'presenter' });
    expect(legacy.ok && (legacy.data as Record<string, unknown>).mode).toBe('presenter');
  });

  it('never flips a presenter node to cinematic when the avatar is cleared', () => {
    const next = coerceVideoConfigForPersist(
      { mode: 'presenter', heygenAvatarId: '' },
      WorkflowNodeType.VideoPresenter,
    );
    expect(next.mode).toBe('presenter');
  });

  it('keeps the legacy flip for video_generation', () => {
    const next = coerceVideoConfigForPersist({ mode: 'presenter', heygenAvatarId: '' });
    expect(next.mode).toBe('cinematic');
  });
});

  it('parses cinematicMode and heygenVideoMode on video_cinematic', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoCinematic, {
      cinematicMode: 'heygen_video',
      heygenVideoMode: 'image_to_video',
      duration: 12,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.data as Record<string, unknown>;
    expect(d.cinematicMode).toBe('heygen_video');
    expect(d.heygenVideoMode).toBe('image_to_video');
    expect(d.duration).toBe(10);
  });

