import { Logger } from '@nestjs/common';
import type { EventsService } from '../events/events.service';
import type { NewsTriggerRunStatusDto } from './news-trigger-run-summary.util';

export const NEWS_RUN_UPDATE_EVENT = 'news:run_update';

const logger = new Logger('NewsTriggerRealtime');

export function emitNewsRunUpdate(
  events: EventsService,
  ruleId: string,
  payload: NewsTriggerRunStatusDto,
): void {
  logger.log(
    `[news:run_update] rule=${ruleId} run=${payload.runId} status=${payload.status}` +
      (payload.outcome ? ` outcome=${payload.outcome}` : ''),
  );
  try {
    events.emitToRule(ruleId, NEWS_RUN_UPDATE_EVENT, payload);
  } catch (err) {
    logger.error(
      `[news:run_update] emit failed rule=${ruleId} run=${payload.runId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
