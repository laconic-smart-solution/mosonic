import type { Server } from 'socket.io';
import { EventsService } from './events.service';

const publishPipelineEventToRedis = jest.fn().mockResolvedValue(undefined);
const publishRealtimeEventToRedis = jest.fn().mockResolvedValue(undefined);

jest.mock('./pipeline-events-redis.util', () => ({
  publishPipelineEventToRedis: (...args: unknown[]) =>
    publishPipelineEventToRedis(...args),
}));

jest.mock('./realtime-events-redis.util', () => ({
  publishRealtimeEventToRedis: (...args: unknown[]) =>
    publishRealtimeEventToRedis(...args),
}));

describe('EventsService.emitToPipeline', () => {
  const config = { get: (_key: string, def?: unknown) => def };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function fakeServer(): Server {
    const to = jest.fn().mockReturnValue({ emit: jest.fn() });
    return { to } as unknown as Server;
  }

  it('emits directly through the in-process gateway when one is already attached (no Redis round trip)', () => {
    const service = new EventsService(config as never);
    service.setServer(fakeServer());

    service.emitToPipeline('p1', 'node:started', { nodeId: 'n1' });

    expect(publishPipelineEventToRedis).not.toHaveBeenCalled();
  });

  it('falls back to the Redis bridge when no in-process gateway is attached (split worker process)', () => {
    const service = new EventsService(config as never);

    service.emitToPipeline('p1', 'node:started', { nodeId: 'n1' });

    expect(publishPipelineEventToRedis).toHaveBeenCalledTimes(1);
    expect(publishPipelineEventToRedis).toHaveBeenCalledWith(
      expect.any(String),
      'p1',
      'node:started',
      { nodeId: 'n1' },
    );
  });

  it('does not touch Redis when the bridge is explicitly disabled and there is no server', () => {
    const disabledConfig = {
      get: (key: string, def?: unknown) =>
        key === 'PIPELINE_EVENTS_BRIDGE' ? 'false' : def,
    };
    const service = new EventsService(disabledConfig as never);

    service.emitToPipeline('p1', 'node:started', { nodeId: 'n1' });

    expect(publishPipelineEventToRedis).not.toHaveBeenCalled();
  });
});
