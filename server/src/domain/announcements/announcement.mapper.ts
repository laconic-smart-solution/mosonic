import type { AnnouncementRecord } from './announcement.types';

export function toAnnouncementDto(record: AnnouncementRecord) {
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    level: record.level,
    status: record.status,
    sendInApp: record.sendInApp,
    sendLine: record.sendLine,
    createdBy: record.createdBy,
    publishedAt: record.publishedAt.toISOString(),
    inAppRecipientCount: record.inAppRecipientCount,
    lineTotal: record.lineTotal,
    lineSent: record.lineSent,
    lineFailed: record.lineFailed,
    lineFailedIds: record.lineFailedIds,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toPublicAnnouncementDto(record: AnnouncementRecord) {
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    level: record.level,
    publishedAt: record.publishedAt.toISOString(),
  };
}
