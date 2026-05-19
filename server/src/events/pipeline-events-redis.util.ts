import Redis from 'ioredis';

export const PIPELINE_EVENTS_CHANNEL = 'pipeline:logs';

export async function publishPipelineEventToRedis(
  redisUrl: string,
  pipelineId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    await client.publish(
      PIPELINE_EVENTS_CHANNEL,
      JSON.stringify({ pipelineId, event, payload }),
    );
  } finally {
    await client.quit();
  }
}
