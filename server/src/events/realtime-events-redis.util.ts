import Redis from 'ioredis';

/** Cross-process realtime fan-out (worker → API Socket.IO). */
export const REALTIME_EVENTS_CHANNEL = 'realtime:events';

export type RealtimeRedisEnvelope =
  | { scope: 'pipeline'; id: string; event: string; payload: unknown }
  | { scope: 'rule'; id: string; event: string; payload: unknown }
  | { scope: 'user'; id: string; event: string; payload: unknown };

export async function publishRealtimeEventToRedis(
  redisUrl: string,
  envelope: RealtimeRedisEnvelope,
): Promise<void> {
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    await client.publish(
      REALTIME_EVENTS_CHANNEL,
      JSON.stringify(envelope),
    );
  } finally {
    await client.quit();
  }
}
