import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CommsNotifyService } from '../comms/comms-notify.service';
import {
  redisEnvFromConfig,
  resolveRedisUrl,
} from '../config/redis-connection.util';
import { EventsService } from '../events/events.service';
import { postPublishingNowNotification } from '../events/notification.util';
import { McpService } from '../mcp/mcp.service';
import { PostService } from '../post/post.service';
import { PostStatus } from '../post/schemas/post.schema';
import {
  SCHEDULER_EVENTS_CHANNEL,
  type SchedulerDispatchMessage,
} from './scheduler.types';

@Injectable()
export class SchedulerEventsBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SchedulerEventsBridgeService.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly posts: PostService,
    private readonly mcp: McpService,
    private readonly events: EventsService,
    private readonly comms: CommsNotifyService,
  ) {}

  onModuleInit(): void {
    if (
      this.config.get<string>('SCHEDULER_EVENTS_BRIDGE', 'true') === 'false'
    ) {
      return;
    }
    const url = resolveRedisUrl(redisEnvFromConfig(this.config));
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    const channel =
      this.config.get<string>('SCHEDULER_REDIS_CHANNEL')?.trim() ||
      SCHEDULER_EVENTS_CHANNEL;
    void this.subscriber.subscribe(channel, (err) => {
      if (err) {
        this.logger.error(`Scheduler Redis subscribe failed: ${err.message}`);
      }
    });
    this.subscriber.on('message', (_ch, message) => {
      void this.handleMessage(message);
    });
    this.logger.log(`Scheduler events Redis bridge listening on ${channel}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  private async handleMessage(message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message) as SchedulerDispatchMessage;
      if (parsed.eventType !== 'SOCIAL_PUBLISH' || !parsed.refId?.trim()) {
        this.logger.warn(`Ignored scheduler message: ${message}`);
        return;
      }
      await this.handleSocialPublish(parsed.refId.trim());
    } catch (error) {
      this.logger.warn(
        `Ignored invalid scheduler message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async handleSocialPublish(postId: string): Promise<void> {
    const post = await this.posts.findByPostIdInternal(postId);
    if (!post) {
      this.logger.warn(`SOCIAL_PUBLISH: post ${postId} not found`);
      return;
    }
    if (post.status === PostStatus.Published || post.status === PostStatus.Cancelled) {
      this.logger.log(
        `SOCIAL_PUBLISH: skip post ${postId} status=${post.status}`,
      );
      return;
    }
    if (post.status !== PostStatus.Scheduled) {
      this.logger.warn(
        `SOCIAL_PUBLISH: unexpected status ${post.status} for ${postId}`,
      );
      return;
    }
    const zernioPostId = post.zernioPostId?.trim();
    if (!zernioPostId) {
      this.logger.warn(`SOCIAL_PUBLISH: post ${postId} missing zernioPostId`);
      return;
    }

    try {
      await this.mcp.updatePost({
        postId: zernioPostId,
        publishNow: true,
      });
      this.logger.log(
        `SOCIAL_PUBLISH: triggered Zernio publishNow for post ${postId}`,
      );
      this.notifyPublishingNow(post.userId, {
        uploadId: post.uploadRef,
        postId: post.postId,
        channels: post.channels,
      });
    } catch (error) {
      this.logger.error(
        `SOCIAL_PUBLISH failed for ${postId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private notifyPublishingNow(
    userId: string | null | undefined,
    args: {
      uploadId: string;
      postId: string;
      channels?: string[] | null;
    },
  ): void {
    const id = userId?.trim();
    if (!id) return;
    const body = postPublishingNowNotification(args);
    this.events.emitUserNotification({
      userId: id,
      sector: 'upload',
      type: 'post.publishing',
      title: body.title,
      message: body.message,
      data: body.data,
      action: body.action,
    });
    void this.comms.notifyUser(id, `${body.title} — ${body.message}`);
  }
}
