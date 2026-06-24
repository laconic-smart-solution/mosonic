import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  IPostAnalyticsRepository,
  PostAnalyticsRecord,
} from '../interfaces/post-analytics.repository.interface';

@Injectable()
export class PrismaPostAnalyticsRepository implements IPostAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPostId(postId: string): Promise<PostAnalyticsRecord | null> {
    return this.prisma.postAnalytics.findUnique({ where: { postId } });
  }

  create(data: Prisma.PostAnalyticsCreateInput): Promise<PostAnalyticsRecord> {
    return this.prisma.postAnalytics.create({ data });
  }

  upsertSyncResult(
    postId: string,
    data: Prisma.PostAnalyticsUpdateInput,
  ): Promise<PostAnalyticsRecord> {
    return this.prisma.postAnalytics.upsert({
      where: { postId },
      create: {
        postId,
        zernioPostId: String(data.zernioPostId ?? ''),
        ruleRef: String(data.ruleRef ?? ''),
        userId: String(data.userId ?? ''),
        syncStatus: (data.syncStatus as PostAnalyticsRecord['syncStatus']) ?? 'pending',
        pulledAt: (data.pulledAt as Date) ?? new Date(),
        period: data.period ?? {},
        platformMetrics: data.platformMetrics ?? [],
      },
      update: data,
    });
  }

  findByPostIds(postIds: string[]): Promise<PostAnalyticsRecord[]> {
    return this.prisma.postAnalytics.findMany({
      where: { postId: { in: postIds } },
    });
  }
}
