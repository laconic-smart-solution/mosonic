import { PostAnalyticsSyncStatus as PrismaPostAnalyticsSyncStatus } from '@prisma/client';
import type { ChannelMetrics } from '../../analytics/schemas/analytics.schema';

export const PostAnalyticsSyncStatus = {
  ...PrismaPostAnalyticsSyncStatus,
  Pending: PrismaPostAnalyticsSyncStatus.pending,
  Synced: PrismaPostAnalyticsSyncStatus.synced,
  Partial: PrismaPostAnalyticsSyncStatus.partial,
  Unavailable: PrismaPostAnalyticsSyncStatus.unavailable,
} as const;

export type PostAnalyticsSyncStatus =
  (typeof PostAnalyticsSyncStatus)[keyof typeof PostAnalyticsSyncStatus];

export enum PlatformMetricSyncStatus {
  Pending = 'pending',
  Synced = 'synced',
  Failed = 'failed',
  Unavailable = 'unavailable',
}

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
}

export interface PlatformMetricEntry {
  platform: string;
  metrics: ChannelMetrics | null;
  syncStatus: PlatformMetricSyncStatus;
  platformPostUrl: string | null;
  errorMessage: string | null;
}

export interface PostAnalytics {
  postId: string;
  zernioPostId: string;
  ruleRef: string;
  userId: string;
  syncStatus: PostAnalyticsSyncStatus;
  pulledAt: Date;
  period: AnalyticsPeriod;
  platformMetrics: PlatformMetricEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type PostAnalyticsDocument = PostAnalytics;
