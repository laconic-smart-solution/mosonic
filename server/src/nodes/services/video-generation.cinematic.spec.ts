import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoGenerationService } from './video-generation.service';
import type { HeygenAssetsService } from './heygen-assets.service';
import type { LlmService } from '../../llm/llm.service';
import type { EventsService } from '../../events/events.service';
import type { ScriptDurationService } from './script-duration.service';

describe('VideoGenerationService cinematic submit (mocked HeyGen)', () => {
  const submitCinematicAvatarVideo = jest.fn();
  const submitHeygenVideoModel = jest.fn();
  const resolveCallbackUrl = jest.fn().mockReturnValue('https://example.com/cb');
  const heygen = {
    submitCinematicAvatarVideo,
    submitHeygenVideoModel,
    resolveCallbackUrl,
  } as unknown as HeygenAssetsService;

  const svc = new VideoGenerationService(
    { get: jest.fn() } as unknown as ConfigService,
    {} as LlmService,
    { emit: jest.fn() } as unknown as EventsService,
    heygen,
    {} as ScriptDurationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    submitCinematicAvatarVideo.mockResolvedValue({ videoId: 'vid-avatar-1' });
    submitHeygenVideoModel.mockResolvedValue({ videoId: 'vid-model-1' });
    jest.spyOn(svc, 'emitProcessing').mockResolvedValue(undefined as never);
  });

  const baseInput = {
    pipelineId: 'pipe-1',
    nodeId: 'node-1',
    contentPrompt: 'Sunlit office walkthrough, handheld 35mm',
    previousOutputs: {},
    rule: { brand: { brandName: 'Acme' } } as never,
  };

  it('submits cinematic_avatar with look ids (no live network beyond mock)', async () => {
    const result = await svc.submitCinematicVideoJob({
      ...baseInput,
      config: {
        mode: 'cinematic',
        cinematicMode: 'cinematic_avatar',
        heygenAvatarId: 'look-1',
        duration: 10,
        aspectRatio: '16:9',
      },
    });
    expect(submitCinematicAvatarVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Sunlit'),
        avatarIds: ['look-1'],
        model: 'heygen_video_1',
        durationSeconds: 10,
      }),
    );
    expect(submitHeygenVideoModel).not.toHaveBeenCalled();
    expect(result.externalJobId).toBe('vid-avatar-1');
    expect(result.videoProvider).toBe('heygen');
  });

  it('submits heygen_video text_to_video without avatar', async () => {
    const result = await svc.submitCinematicVideoJob({
      ...baseInput,
      config: {
        mode: 'cinematic',
        cinematicMode: 'heygen_video',
        heygenVideoMode: 'text_to_video',
        duration: 10,
      },
    });
    expect(submitHeygenVideoModel).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'text_to_video',
        prompt: expect.stringContaining('Sunlit'),
      }),
    );
    expect(submitCinematicAvatarVideo).not.toHaveBeenCalled();
    expect(result.externalJobId).toBe('vid-model-1');
  });

  it('rejects cinematic_avatar without a look', async () => {
    await expect(
      svc.submitCinematicVideoJob({
        ...baseInput,
        config: { mode: 'cinematic', cinematicMode: 'cinematic_avatar' },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(submitCinematicAvatarVideo).not.toHaveBeenCalled();
  });
});