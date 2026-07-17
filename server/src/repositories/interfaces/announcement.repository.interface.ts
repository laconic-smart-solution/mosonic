import type { AnnouncementLevel, AnnouncementStatus } from '@prisma/client';
import type { AnnouncementRecord } from '../../domain/announcements/announcement.types';

export interface IAnnouncementRepository {
  create(data: {
    title: string;
    message: string;
    level: AnnouncementLevel;
    sendInApp: boolean;
    sendLine: boolean;
    createdBy: string;
  }): Promise<AnnouncementRecord>;
  updateDelivery(
    id: string,
    data: {
      status?: AnnouncementStatus;
      inAppRecipientCount?: number;
      lineTotal?: number;
      lineSent?: number;
      lineFailed?: number;
      lineFailedIds?: string[];
    },
  ): Promise<AnnouncementRecord>;
  findById(id: string): Promise<AnnouncementRecord | null>;
  list(
    page: number,
    limit: number,
  ): Promise<{ rows: AnnouncementRecord[]; total: number }>;
  listPublished(
    page: number,
    limit: number,
  ): Promise<{ rows: AnnouncementRecord[]; total: number }>;
  findLatestPublished(): Promise<AnnouncementRecord | null>;
}
