import { WorkflowNodeType } from './workflow-node-llm.enums';
import {
  isLegacyVideoNodeType,
  isVideoNodeType,
  migrateLegacyVideoNode,
  normalizeVideoNodeType,
  videoModeForNode,
  videoNodeTypeForMode,
  withVideoModeForType,
} from './video-node-type.util';

describe('video-node-type.util', () => {
  it('recognises split and legacy video types', () => {
    expect(isVideoNodeType(WorkflowNodeType.VideoPresenter)).toBe(true);
    expect(isVideoNodeType(WorkflowNodeType.VideoCinematic)).toBe(true);
    expect(isVideoNodeType(WorkflowNodeType.VideoGeneration)).toBe(true);
    expect(isVideoNodeType(WorkflowNodeType.ImageGeneration)).toBe(false);
    expect(isVideoNodeType(undefined)).toBe(false);
    expect(isLegacyVideoNodeType(WorkflowNodeType.VideoGeneration)).toBe(true);
    expect(isLegacyVideoNodeType(WorkflowNodeType.VideoPresenter)).toBe(false);
  });

  it('takes the mode from the split type and ignores a conflicting config.mode', () => {
    expect(videoModeForNode(WorkflowNodeType.VideoPresenter, { mode: 'cinematic' })).toBe('presenter');
    expect(videoModeForNode(WorkflowNodeType.VideoCinematic, { mode: 'presenter' })).toBe('cinematic');
  });

  it('reads config.mode for legacy nodes, defaulting to cinematic', () => {
    expect(videoModeForNode(WorkflowNodeType.VideoGeneration, { mode: 'presenter' })).toBe('presenter');
    expect(videoModeForNode(WorkflowNodeType.VideoGeneration, { mode: 'cinematic' })).toBe('cinematic');
    expect(videoModeForNode(WorkflowNodeType.VideoGeneration, {})).toBe('cinematic');
    expect(videoModeForNode(WorkflowNodeType.VideoGeneration, null)).toBe('cinematic');
  });

  it('maps a mode to its node type', () => {
    expect(videoNodeTypeForMode('presenter')).toBe(WorkflowNodeType.VideoPresenter);
    expect(videoNodeTypeForMode('cinematic')).toBe(WorkflowNodeType.VideoCinematic);
    expect(videoNodeTypeForMode(undefined)).toBe(WorkflowNodeType.VideoCinematic);
  });

  it('normalizes only the legacy type', () => {
    expect(normalizeVideoNodeType(WorkflowNodeType.VideoGeneration, { mode: 'presenter' })).toBe(
      WorkflowNodeType.VideoPresenter,
    );
    expect(normalizeVideoNodeType(WorkflowNodeType.VideoGeneration, {})).toBe(WorkflowNodeType.VideoCinematic);
    expect(normalizeVideoNodeType(WorkflowNodeType.ImageGeneration, { mode: 'presenter' })).toBe(
      WorkflowNodeType.ImageGeneration,
    );
    expect(normalizeVideoNodeType(WorkflowNodeType.VideoCinematic, { mode: 'presenter' })).toBe(
      WorkflowNodeType.VideoCinematic,
    );
  });

  it('pins config.mode to the node type', () => {
    expect(withVideoModeForType(WorkflowNodeType.VideoPresenter, { mode: 'cinematic', duration: 20 })).toEqual({
      mode: 'presenter',
      duration: 20,
    });
    expect(withVideoModeForType(WorkflowNodeType.TextGeneration, { tone: 'x' })).toEqual({ tone: 'x' });
  });

  it('migrates a legacy node by mode and keeps every other field', () => {
    const presenter = migrateLegacyVideoNode({
      nodeId: 'v1',
      type: WorkflowNodeType.VideoGeneration as string,
      config: { mode: 'presenter', heygenAvatarId: 'av', heygenVoiceId: 'vo' },
    });
    expect(presenter).toEqual({
      nodeId: 'v1',
      type: WorkflowNodeType.VideoPresenter,
      config: { mode: 'presenter', heygenAvatarId: 'av', heygenVoiceId: 'vo' },
    });
    const cinematic = migrateLegacyVideoNode({
      nodeId: 'v2',
      type: WorkflowNodeType.VideoGeneration as string,
      config: { duration: 8 },
    });
    expect(cinematic.type).toBe(WorkflowNodeType.VideoCinematic);
    expect(cinematic.config).toEqual({ duration: 8, mode: 'cinematic' });
    const untouched = { nodeId: 'i', type: WorkflowNodeType.ImageGeneration as string, config: {} };
    expect(migrateLegacyVideoNode(untouched)).toBe(untouched);
  });
});
