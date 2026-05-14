import axios from 'axios';
import { ConfigService } from '@nestjs/config';

import { ZernioRestClient } from './zernio-rest.client';

describe('ZernioRestClient', () => {
  let mockHttp: {
    post: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
    interceptors: { response: { use: jest.Mock } };
  };

  beforeEach(() => {
    mockHttp = {
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      interceptors: { response: { use: jest.fn() } },
    };
    jest.spyOn(axios, 'create').mockReturnValue(mockHttp as never);
    jest.spyOn(axios, 'put').mockResolvedValue({ status: 200 } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeClient() {
    const config = {
      get: (k: string) => {
        if (k === 'ZERNIO_API_KEY') return 'test-key';
        return undefined;
      },
    } as unknown as ConfigService;
    return new ZernioRestClient(config);
  }

  it('publishCreatePost includes mediaItems and presigns external media', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([137, 80]).buffer,
    }) as unknown as typeof fetch;

    mockHttp.post.mockImplementation((path: string) => {
      if (path === '/media/presign') {
        return Promise.resolve({
          data: {
            uploadUrl: 'https://storage.googleapis.com/bucket/put-here',
            publicUrl: 'https://storage.googleapis.com/bucket/final.png',
          },
        });
      }
      if (path === '/posts') {
        return Promise.resolve({
          data: { post: { _id: 'postid123' } },
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const client = makeClient();
    const out = await client.publishCreatePost({
      profileId: 'prof1',
      platforms: [
        {
          platform: 'twitter',
          accountId: 'acc1',
          content: 'Hello',
          mediaUrl: 'https://files.example.com/a.png',
        },
      ],
      publishNow: true,
      scheduledAt: null,
    });

    expect(out.postId).toBe('postid123');
    expect(mockHttp.post).toHaveBeenCalledWith(
      '/media/presign',
      expect.objectContaining({
        filename: expect.any(String),
        contentType: 'image/png',
      }),
    );
    const postsCall = mockHttp.post.mock.calls.find((c) => c[0] === '/posts');
    expect(postsCall).toBeDefined();
    const body = postsCall![1] as Record<string, unknown>;
    expect(body.mediaItems).toEqual([
      {
        url: 'https://storage.googleapis.com/bucket/final.png',
        type: 'image',
      },
    ]);
    const plats = body.platforms as Array<Record<string, unknown>>;
    expect(plats[0].customMedia).toEqual(body.mediaItems);
    expect(axios.put).toHaveBeenCalledWith(
      'https://storage.googleapis.com/bucket/put-here',
      expect.any(Buffer),
      expect.objectContaining({
        headers: { 'Content-Type': 'image/png' },
      }),
    );
  });

  it('sniffs mime when source returns octet-stream and no extension', async () => {
    // PNG signature
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () =>
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
          .buffer,
    }) as unknown as typeof fetch;

    mockHttp.post.mockImplementation((path: string, body?: unknown) => {
      if (path === '/media/presign') {
        return Promise.resolve({
          data: {
            uploadUrl: 'https://storage.googleapis.com/bucket/put-here',
            publicUrl: 'https://storage.googleapis.com/bucket/final.png',
          },
        });
      }
      if (path === '/posts') {
        return Promise.resolve({
          data: { post: { _id: 'postid123' } },
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const client = makeClient();
    await client.publishCreatePost({
      profileId: 'prof1',
      platforms: [
        {
          platform: 'twitter',
          accountId: 'acc1',
          content: 'Hello',
          mediaUrl: 'https://files.example.com/download/abc123',
        },
      ],
      publishNow: true,
      scheduledAt: null,
    });

    const presignCall = mockHttp.post.mock.calls.find((c) => c[0] === '/media/presign');
    expect(presignCall).toBeDefined();
    const presignBody = presignCall![1] as Record<string, unknown>;
    expect(presignBody.contentType).toBe('image/png');
    expect(String(presignBody.filename)).toMatch(/\.png$/);
  });

  it('publishCreatePost skips presign for googleapis source URLs', async () => {
    mockHttp.post.mockImplementation((path: string) => {
      if (path === '/posts') {
        return Promise.resolve({
          data: { post: { _id: 'p2' } },
        });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    const client = makeClient();
    await client.publishCreatePost({
      profileId: 'prof1',
      platforms: [
        {
          platform: 'twitter',
          accountId: 'acc1',
          content: 'Hi',
          mediaUrl:
            'https://storage.googleapis.com/my-bucket/existing.png',
        },
      ],
      publishNow: true,
      scheduledAt: null,
    });

    expect(mockHttp.post).not.toHaveBeenCalledWith(
      '/media/presign',
      expect.anything(),
    );
    expect(axios.put).not.toHaveBeenCalled();
    const postsCall = mockHttp.post.mock.calls.find((c) => c[0] === '/posts');
    const body = postsCall![1] as Record<string, unknown>;
    expect(body.mediaItems).toEqual([
      {
        url: 'https://storage.googleapis.com/my-bucket/existing.png',
        type: 'image',
      },
    ]);
  });

  it('deleteAccount sends DELETE /accounts/:accountId', async () => {
    mockHttp.delete.mockResolvedValue({ status: 200 });

    const client = makeClient();
    await client.deleteAccount('acc_123');

    expect(mockHttp.delete).toHaveBeenCalledWith('/accounts/acc_123');
  });

  it('deleteAccount treats 404 as success', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    mockHttp.delete.mockRejectedValue(err);

    const client = makeClient();
    await expect(client.deleteAccount('gone')).resolves.toBeUndefined();
  });
});
