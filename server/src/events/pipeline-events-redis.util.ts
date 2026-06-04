import { publishRealtimeEventToRedis } from './realtime-events-redis.util';

/** @deprecated Legacy channel; new publishes use {@link REALTIME_EVENTS_CHANNEL}. */
export const PIPELINE_EVENTS_CHANNEL = 'pipeline:logs';

export async function publishPipelineEventToRedis(
  redisUrl: string,
  pipelineId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  await publishRealtimeEventToRedis(redisUrl, {
    scope: 'pipeline',
    id: pipelineId,
    event,
    payload,
  });
}
