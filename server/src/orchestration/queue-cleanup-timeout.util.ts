export type CleanupLogger = { warn: (message: string) => void };

/**
 * Bounds best-effort Redis/BullMQ cleanup so a stalled or unreachable queue
 * connection (e.g. Redis down while pipeline nodes sit pending forever)
 * cannot hang a user-facing action like cancel/force-skip indefinitely.
 * Failures and timeouts are logged and swallowed — queue cleanup is
 * best-effort; the pipeline/node status change in Postgres is what matters.
 */
export async function withQueueCleanupTimeout(
  label: string,
  work: () => Promise<void>,
  logger: CleanupLogger,
  timeoutMs = 5_000,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const guarded = work().catch((err) => {
    logger.warn(
      `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(
        `${label} timed out after ${timeoutMs}ms (queue unreachable?) — continuing`,
      );
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([guarded, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
