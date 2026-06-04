import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HeygenAssetsService,
  heygenCallbackId,
  parseHeygenCallbackId,
} from './heygen-assets.service';

describe('HeyGen callback id helpers', () => {
  it('formats pipeline and node with __ separator', () => {
    expect(heygenCallbackId('pipe-1', 'node-2')).toBe('pipe-1__node-2');
  });

  it('parses valid callback ids', () => {
    expect(parseHeygenCallbackId('pipe-1__node-2')).toEqual({
      pipelineId: 'pipe-1',
      nodeId: 'node-2',
    });
  });

  it('rejects invalid callback ids', () => {
    expect(parseHeygenCallbackId('')).toBeNull();
    expect(parseHeygenCallbackId('no-separator')).toBeNull();
    expect(parseHeygenCallbackId('__only-node')).toBeNull();
  });
});

describe('HeygenAssetsService avatar looks', () => {
  let service: HeygenAssetsService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      providers: [
        HeygenAssetsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'HEYGEN_API_KEY' ? 'test-key' : undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(HeygenAssetsService);
  });

  it('lists private avatar looks with pagination', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: 'look-1',
                name: 'Photo Avatar',
                avatar_type: 'photo_avatar',
                preview_image_url: 'https://example.com/1.jpg',
                default_voice_id: 'voice-1',
                status: 'completed',
              },
            ],
            has_more: true,
            next_token: 'page-2',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: 'look-2',
                name: 'Studio Avatar',
                avatar_type: 'studio_avatar',
                preview_image_url: 'https://example.com/2.jpg',
              },
            ],
            has_more: false,
          }),
      });

    const looks = await service.listAvatarLooks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/v3/avatars/looks?');
    expect(fetchMock.mock.calls[0][0]).toContain('ownership=private');
    expect(fetchMock.mock.calls[1][0]).toContain('token=page-2');
    expect(looks).toEqual([
      {
        lookId: 'look-1',
        name: 'Photo Avatar',
        avatarType: 'photo_avatar',
        previewImageUrl: 'https://example.com/1.jpg',
        defaultVoiceId: 'voice-1',
        status: 'completed',
        deletable: true,
      },
      {
        lookId: 'look-2',
        name: 'Studio Avatar',
        avatarType: 'studio_avatar',
        previewImageUrl: 'https://example.com/2.jpg',
        defaultVoiceId: undefined,
        status: undefined,
        deletable: false,
      },
    ]);
  });

  it('lists one page of voices with pagination metadata', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            {
              voice_id: 'voice-1',
              name: 'Sara',
              language: 'English',
              gender: 'female',
              preview_audio_url: 'https://files.heygen.ai/preview/sara.mp3',
              type: 'public',
            },
          ],
          has_more: true,
          next_token: 'page-2',
        }),
    });

    const page = await service.listVoicesPage({
      language: 'English',
      gender: 'female',
      limit: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('language=English');
    expect(fetchMock.mock.calls[0][0]).toContain('gender=female');
    expect(fetchMock.mock.calls[0][0]).toContain('limit=20');
    expect(page.hasMore).toBe(true);
    expect(page.nextToken).toBe('page-2');
    expect(page.voices).toHaveLength(1);
  });

  it('fetches voice preview audio via HeyGen CDN', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: {
              voice_id: 'voice-1',
              name: 'Archer',
              language: 'English',
              gender: 'male',
              preview_audio_url: 'https://cdn.example/preview.wav',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'audio/wav' },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

    const result = await service.fetchVoicePreviewAudio('voice-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example/preview.wav');
    expect(result.contentType).toBe('audio/wav');
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it('deletes an avatar look', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ data: { id: 'look-1' } }),
    });

    await expect(service.deleteAvatarLook('look-1')).resolves.toEqual({
      lookId: 'look-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/avatars/looks/look-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('surfaces HeyGen delete errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () =>
        JSON.stringify({
          error: {
            code: 'invalid_parameter',
            message: 'Deleting this avatar look type is not supported.',
          },
        }),
    });

    await expect(service.deleteAvatarLook('look-studio')).rejects.toThrow(
      /Deleting this avatar look type is not supported/,
    );
  });
});
