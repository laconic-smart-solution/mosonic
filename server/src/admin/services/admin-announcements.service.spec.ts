import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminAnnouncementsService } from './admin-announcements.service';
import type { EventsService } from '../../events/events.service';
import type { LineConnectionService } from '../../line/line-connection.service';
import type { LineService } from '../../line/line.service';
import type { IAnnouncementRepository } from '../../repositories/interfaces/announcement.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ann-1',
    title: 'Maintenance',
    message: 'Scheduled downtime tonight',
    level: 'info',
    status: 'published',
    sendInApp: true,
    sendLine: false,
    createdBy: 'admin-1',
    publishedAt: new Date('2026-07-17T02:00:00Z'),
    inAppRecipientCount: 0,
    lineTotal: null,
    lineSent: null,
    lineFailed: null,
    lineFailedIds: [],
    createdAt: new Date('2026-07-17T02:00:00Z'),
    updatedAt: new Date('2026-07-17T02:00:00Z'),
    ...overrides,
  };
}

describe('AdminAnnouncementsService', () => {
  const announcements = {
    create: jest.fn(),
    updateDelivery: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
  const users = {
    listActiveUserIds: jest.fn(),
  };
  const events = {
    emitUserNotification: jest.fn(),
  };
  const line = {
    sendBatchText: jest.fn(),
  };
  const lineConnections = {
    listAllLineUserIds: jest.fn(),
  };

  let service: AdminAnnouncementsService;

  beforeEach(() => {
    jest.clearAllMocks();
    announcements.create.mockResolvedValue(makeRecord());
    announcements.updateDelivery.mockImplementation(
      (_id: string, data: Record<string, unknown>) =>
        Promise.resolve(makeRecord(data)),
    );
    service = new AdminAnnouncementsService(
      announcements as unknown as IAnnouncementRepository,
      users as unknown as IUserRepository,
      events as unknown as EventsService,
      line as unknown as LineService,
      lineConnections as unknown as LineConnectionService,
    );
  });

  it('rejects when both channels are disabled', async () => {
    await expect(
      service.publish({
        title: 'T',
        message: 'M',
        level: 'info',
        sendInApp: false,
        sendLine: false,
        createdBy: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(announcements.create).not.toHaveBeenCalled();
  });

  it('in-app only: fans out to each active user and skips LINE', async () => {
    users.listActiveUserIds.mockResolvedValue(['u1', 'u2', 'u3']);

    const result = await service.publish({
      title: 'Maintenance',
      message: 'Scheduled downtime tonight',
      level: 'warning',
      sendInApp: true,
      sendLine: false,
      createdBy: 'admin-1',
    });

    expect(events.emitUserNotification).toHaveBeenCalledTimes(3);
    expect(events.emitUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        sector: 'admin',
        type: 'announcement.published',
        title: 'Maintenance',
        data: expect.objectContaining({
          announcementId: 'ann-1',
          level: 'warning',
        }),
      }),
    );
    expect(line.sendBatchText).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.inApp).toEqual({ recipientCount: 3 });
    expect(result.line).toBeUndefined();
    expect(announcements.updateDelivery).toHaveBeenCalledWith(
      'ann-1',
      expect.objectContaining({ inAppRecipientCount: 3, status: 'published' }),
    );
  });

  it('LINE only: batch-sends and does not fan out sockets', async () => {
    lineConnections.listAllLineUserIds.mockResolvedValue(['Ua', 'Ub']);
    line.sendBatchText.mockResolvedValue({
      total: 2,
      sent: 2,
      failed: 0,
      chunkCount: 1,
      failedRecipientIds: [],
    });

    const result = await service.publish({
      title: 'Promo',
      message: 'Half price credits',
      level: 'info',
      sendInApp: false,
      sendLine: true,
      createdBy: 'admin-1',
    });

    expect(events.emitUserNotification).not.toHaveBeenCalled();
    expect(line.sendBatchText).toHaveBeenCalledWith(
      ['Ua', 'Ub'],
      'Promo\n\nHalf price credits',
    );
    expect(result.success).toBe(true);
    expect(result.line).toEqual(
      expect.objectContaining({ total: 2, sent: 2, failed: 0 }),
    );
    expect(result.inApp).toBeUndefined();
    expect(announcements.updateDelivery).toHaveBeenCalledWith(
      'ann-1',
      expect.objectContaining({ lineTotal: 2, lineSent: 2, lineFailed: 0 }),
    );
  });

  it('both channels: emits sockets and calls LINE batch', async () => {
    users.listActiveUserIds.mockResolvedValue(['u1']);
    lineConnections.listAllLineUserIds.mockResolvedValue(['Ua']);
    line.sendBatchText.mockResolvedValue({
      total: 1,
      sent: 1,
      failed: 0,
      chunkCount: 1,
      failedRecipientIds: [],
    });

    const result = await service.publish({
      title: 'T',
      message: 'M',
      level: 'critical',
      sendInApp: true,
      sendLine: true,
      createdBy: 'admin-1',
    });

    expect(events.emitUserNotification).toHaveBeenCalledTimes(1);
    expect(line.sendBatchText).toHaveBeenCalledWith(
      ['Ua'],
      '[Critical] T\n\nM',
    );
    expect(result.success).toBe(true);
    expect(result.inApp).toEqual({ recipientCount: 1 });
    expect(result.line).toEqual(expect.objectContaining({ sent: 1 }));
  });

  it('LINE failure after in-app success keeps announcement published', async () => {
    users.listActiveUserIds.mockResolvedValue(['u1']);
    lineConnections.listAllLineUserIds.mockResolvedValue(['Ua']);
    line.sendBatchText.mockRejectedValue(new Error('line-service down'));

    const result = await service.publish({
      title: 'T',
      message: 'M',
      level: 'info',
      sendInApp: true,
      sendLine: true,
      createdBy: 'admin-1',
    });

    expect(result.success).toBe(true);
    expect(result.line).toEqual(
      expect.objectContaining({ failed: 1, error: 'line-service down' }),
    );
    expect(announcements.updateDelivery).toHaveBeenCalledWith(
      'ann-1',
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('LINE-only failure marks announcement failed', async () => {
    lineConnections.listAllLineUserIds.mockResolvedValue(['Ua']);
    line.sendBatchText.mockRejectedValue(new Error('line-service down'));

    const result = await service.publish({
      title: 'T',
      message: 'M',
      level: 'info',
      sendInApp: false,
      sendLine: true,
      createdBy: 'admin-1',
    });

    expect(result.success).toBe(false);
    expect(announcements.updateDelivery).toHaveBeenCalledWith(
      'ann-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('LINE with zero connected users succeeds without calling line-service', async () => {
    lineConnections.listAllLineUserIds.mockResolvedValue([]);

    const result = await service.publish({
      title: 'T',
      message: 'M',
      level: 'info',
      sendInApp: false,
      sendLine: true,
      createdBy: 'admin-1',
    });

    expect(line.sendBatchText).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.line).toEqual(
      expect.objectContaining({ total: 0, sent: 0, failed: 0 }),
    );
  });

  it('getById throws NotFound for missing announcement', async () => {
    announcements.findById.mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
