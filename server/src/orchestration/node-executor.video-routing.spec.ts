/**
 * Routing only: VideoGenerationService is a plain object of jest.fn mocks, so
 * nothing reaches HeyGen, Sora or OpenAI.
 */
// `@toon-format/toon` is ESM-only; Jest's default transform can't parse it.
jest.mock('../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));

import { WorkflowNodeType } from '../nodes/workflow-node-llm.enums';
import { VideoGenerationService } from '../nodes/services/video-generation.service';
import { NodeExecutor } from './node-executor.service';

function executorWith(video: Record<string, jest.Mock>) {
  const args = new Array(13).fill({});
  args[4] = video;
  return new (NodeExecutor as unknown as new (...a: unknown[]) => NodeExecutor)(...args);
}

describe('NodeExecutor video routing', () => {
  const result = { output: { video: 'https://example.invalid/v.mp4' } };
  let video: Record<string, jest.Mock>;
  let route: (type: WorkflowNodeType, input: unknown) => Promise<unknown>;

  beforeEach(() => {
    video = {
      execute: jest.fn().mockResolvedValue(result),
      executePresenter: jest.fn().mockResolvedValue(result),
      executeCinematic: jest.fn().mockResolvedValue(result),
    };
    const ex = executorWith(video) as unknown as {
      executeNodeByType: (type: WorkflowNodeType, input: unknown) => Promise<unknown>;
    };
    route = ex.executeNodeByType.bind(ex);
  });

  it('sends video_presenter to executePresenter', async () => {
    await route(WorkflowNodeType.VideoPresenter, { config: {} });
    expect(video.executePresenter).toHaveBeenCalledTimes(1);
    expect(video.executeCinematic).not.toHaveBeenCalled();
    expect(video.execute).not.toHaveBeenCalled();
  });

  it('sends video_cinematic to executeCinematic', async () => {
    await route(WorkflowNodeType.VideoCinematic, { config: {} });
    expect(video.executeCinematic).toHaveBeenCalledTimes(1);
    expect(video.executePresenter).not.toHaveBeenCalled();
  });

  it('keeps legacy video_generation on execute (mode from config)', async () => {
    await route(WorkflowNodeType.VideoGeneration, { config: { mode: 'presenter' } });
    expect(video.execute).toHaveBeenCalledTimes(1);
  });
});

describe('VideoGenerationService facades', () => {
  // No constructor: no providers or API clients exist; execute itself is mocked.
  const svc = Object.create(VideoGenerationService.prototype) as VideoGenerationService;
  const execute = jest.fn().mockResolvedValue({ output: {} });
  (svc as unknown as { execute: jest.Mock }).execute = execute;

  beforeEach(() => execute.mockClear());

  it('executePresenter forces presenter mode', async () => {
    await svc.executePresenter({ config: { mode: 'cinematic', duration: 20 } } as never);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ config: { mode: 'presenter', duration: 20 } }),
    );
  });

  it('executeCinematic forces cinematic mode', async () => {
    await svc.executeCinematic({ config: { mode: 'presenter' } } as never);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ config: { mode: 'cinematic' } }));
  });
});
