import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerClientService } from './scheduler-client.service';
import type { ScheduledEventRecord } from './scheduler.types';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly client: SchedulerClientService,
    private readonly config: ConfigService,
  ) {}

  private defaultTimezone(): string {
    return (
      this.config.get<string>('SCHEDULER_DEFAULT_TIMEZONE')?.trim() || 'UTC'
    );
  }

  async createPostPublish(
    postId: string,
    runAtIso: string,
    timezone?: string,
  ): Promise<ScheduledEventRecord> {
    return this.client.postJson<ScheduledEventRecord>('/api/v1/events', {
      eventType: 'SOCIAL_PUBLISH',
      refId: postId.trim(),
      runAt: runAtIso,
      timezone: timezone?.trim() || this.defaultTimezone(),
    });
  }

  async reschedulePostPublish(
    postId: string,
    runAtIso: string,
    timezone?: string,
  ): Promise<ScheduledEventRecord> {
    const refId = encodeURIComponent(postId.trim());
    return this.client.putJson<ScheduledEventRecord>(
      `/api/v1/events/SOCIAL_PUBLISH/${refId}`,
      {
        runAt: runAtIso,
        ...(timezone?.trim()
          ? { timezone: timezone.trim() }
          : { timezone: this.defaultTimezone() }),
      },
    );
  }

  async cancelPostPublish(postId: string): Promise<void> {
    const refId = encodeURIComponent(postId.trim());
    try {
      await this.client.delete(`/api/v1/events/SOCIAL_PUBLISH/${refId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to cancel SOCIAL_PUBLISH for ${postId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
