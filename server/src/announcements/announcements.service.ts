import { Inject, Injectable } from '@nestjs/common';
import { toPublicAnnouncementDto } from '../domain/announcements/announcement.mapper';
import type { IAnnouncementRepository } from '../repositories/interfaces/announcement.repository.interface';
import { ANNOUNCEMENT_REPOSITORY } from '../repositories/tokens';

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(ANNOUNCEMENT_REPOSITORY)
    private readonly announcements: IAnnouncementRepository,
  ) {}

  async list(page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { rows, total } = await this.announcements.listPublished(
      safePage,
      safeLimit,
    );
    return {
      announcements: rows.map(toPublicAnnouncementDto),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 0,
    };
  }

  async getLatest() {
    const record = await this.announcements.findLatestPublished();
    if (!record) return { announcement: null };
    return { announcement: toPublicAnnouncementDto(record) };
  }
}
