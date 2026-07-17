import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AnnouncementLevel, AnnouncementStatus } from '@prisma/client';
import { toAnnouncementDto } from '../../domain/announcements/announcement.mapper';
import { EventsService } from '../../events/events.service';
import { adminAnnouncementNotification } from '../../events/notification.util';
import { LineConnectionService } from '../../line/line-connection.service';
import { LineService } from '../../line/line.service';
import type { IAnnouncementRepository } from '../../repositories/interfaces/announcement.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';
import {
  ANNOUNCEMENT_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';

const LINE_TEXT_LIMIT = 5000;

type LineDeliveryResult = {
  total: number;
  sent: number;
  failed: number;
  chunkCount: number;
  failedRecipientIds: string[];
};

export type AnnouncementDto = ReturnType<typeof toAnnouncementDto>;

export type PublishAnnouncementResult = {
  success: boolean;
  announcement: AnnouncementDto;
  inApp?: { recipientCount: number };
  line?: LineDeliveryResult & { error?: string };
};

@Injectable()
export class AdminAnnouncementsService {
  private readonly logger = new Logger(AdminAnnouncementsService.name);

  constructor(
    @Inject(ANNOUNCEMENT_REPOSITORY)
    private readonly announcements: IAnnouncementRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
    private readonly events: EventsService,
    private readonly line: LineService,
    private readonly lineConnections: LineConnectionService,
  ) {}

  async publish(args: {
    title: string;
    message: string;
    level: AnnouncementLevel;
    sendInApp: boolean;
    sendLine: boolean;
    createdBy: string;
  }): Promise<PublishAnnouncementResult> {
    const title = args.title.trim();
    const message = args.message.trim();
    if (!title || !message) {
      throw new BadRequestException('Title and message are required');
    }
    if (!args.sendInApp && !args.sendLine) {
      throw new BadRequestException(
        'At least one channel (sendInApp or sendLine) is required',
      );
    }

    let record = await this.announcements.create({
      title,
      message,
      level: args.level,
      sendInApp: args.sendInApp,
      sendLine: args.sendLine,
      createdBy: args.createdBy,
    });

    let inAppRecipientCount = 0;
    let inAppOk = false;
    if (args.sendInApp) {
      inAppRecipientCount = this.fanOutInApp(
        record.id,
        title,
        message,
        args.level,
        { userIds: await this.users.listActiveUserIds() },
      );
      inAppOk = true;
    }

    let lineResult: (LineDeliveryResult & { error?: string }) | undefined;
    let lineOk = false;
    if (args.sendLine) {
      lineResult = await this.sendLineBatch(title, message, args.level);
      lineOk = !lineResult.error && lineResult.failed < lineResult.total;
      // Zero recipients is not a failure — nothing to deliver.
      if (lineResult.total === 0 && !lineResult.error) lineOk = true;
    }

    const anyOk = inAppOk || lineOk;
    record = await this.announcements.updateDelivery(record.id, {
      status: anyOk ? AnnouncementStatus.published : AnnouncementStatus.failed,
      inAppRecipientCount,
      ...(lineResult
        ? {
            lineTotal: lineResult.total,
            lineSent: lineResult.sent,
            lineFailed: lineResult.failed,
            lineFailedIds: lineResult.failedRecipientIds,
          }
        : {}),
    });

    return {
      success: anyOk,
      announcement: toAnnouncementDto(record),
      ...(args.sendInApp
        ? { inApp: { recipientCount: inAppRecipientCount } }
        : {}),
      ...(lineResult ? { line: lineResult } : {}),
    };
  }

  async list(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { rows, total } = await this.announcements.list(safePage, safeLimit);
    return {
      announcements: rows.map(toAnnouncementDto),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 0,
    };
  }

  async getById(id: string) {
    const record = await this.announcements.findById(id.trim());
    if (!record) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }
    return { announcement: toAnnouncementDto(record) };
  }

  private fanOutInApp(
    announcementId: string,
    title: string,
    message: string,
    level: AnnouncementLevel,
    args: { userIds: string[] },
  ): number {
    const body = adminAnnouncementNotification({
      announcementId,
      title,
      message,
      level,
    });
    for (const userId of args.userIds) {
      this.events.emitUserNotification({
        userId,
        sector: 'admin',
        type: 'announcement.published',
        ...body,
      });
    }
    return args.userIds.length;
  }

  private async sendLineBatch(
    title: string,
    message: string,
    level: AnnouncementLevel,
  ): Promise<LineDeliveryResult & { error?: string }> {
    const levelTag =
      level === AnnouncementLevel.critical
        ? '[Critical] '
        : level === AnnouncementLevel.warning
          ? '[Warning] '
          : '';
    const text = `${levelTag}${title}\n\n${message}`.slice(0, LINE_TEXT_LIMIT);
    const recipientIds = await this.lineConnections.listAllLineUserIds();
    if (recipientIds.length === 0) {
      return {
        total: 0,
        sent: 0,
        failed: 0,
        chunkCount: 0,
        failedRecipientIds: [],
      };
    }

    try {
      return await this.line.sendBatchText(recipientIds, text);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Announcement LINE batch failed: ${errorMessage}`);
      return {
        total: recipientIds.length,
        sent: 0,
        failed: recipientIds.length,
        chunkCount: 0,
        failedRecipientIds: recipientIds,
        error: errorMessage,
      };
    }
  }
}
