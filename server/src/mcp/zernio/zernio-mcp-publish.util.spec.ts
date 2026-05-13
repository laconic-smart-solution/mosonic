import { extractPostIdFromMcpCreateResult } from './zernio-mcp-publish.util';

describe('zernio MCP publish utils', () => {
  it('extracts the root post id from Zernio python-like create responses', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: `{'post': {'platforms': [{'platform': 'facebook', '_id': 'platform_post_id'}], 'scheduledFor': '2026-05-31T06:49:00.000Z', 'status': 'scheduled', 'crosspostingEnabled': True, '_id': 'root_post_id', 'createdAt': '2026-05-12T06:49:57.614Z'}, 'message': 'Post scheduled successfully'}`,
        },
      ],
    };

    expect(extractPostIdFromMcpCreateResult(result)).toBe('root_post_id');
  });

  it('extracts the root post id from JSON create responses', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            post: {
              platforms: [{ _id: 'platform_post_id' }],
              _id: 'root_post_id',
            },
            message: 'Post scheduled successfully',
          }),
        },
      ],
    };

    expect(extractPostIdFromMcpCreateResult(result)).toBe('root_post_id');
  });
});
