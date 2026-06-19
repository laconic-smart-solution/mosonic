import type { Prisma } from '@prisma/client';
import type { PostAnalytics } from '@prisma/client';

export type PostAnalyticsRecord = PostAnalytics;

export interface IPostAnalyticsRepository {
  findByPostId(postId: string): Promise<PostAnalyticsRecord | null>;
  create(data: Prisma.PostAnalyticsCreateInput): Promise<PostAnalyticsRecord>;
  upsertSyncResult(
    postId: string,
    data: Prisma.PostAnalyticsUpdateInput,
  ): Promise<PostAnalyticsRecord>;
  findByPostIds(postIds: string[]): Promise<PostAnalyticsRecord[]>;
}
