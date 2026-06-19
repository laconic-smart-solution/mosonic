import { PostStatus as PrismaPostStatus } from '@prisma/client';

export const PostStatus = {
  ...PrismaPostStatus,
  Pending: PrismaPostStatus.pending,
  Scheduled: PrismaPostStatus.scheduled,
  Published: PrismaPostStatus.published,
  Failed: PrismaPostStatus.failed,
  Cancelled: PrismaPostStatus.cancelled,
  Partial: PrismaPostStatus.partial,
} as const;

export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export enum PlatformPostStatus {
  Pending = 'pending',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface PlatformResult {
  platform: string;
  status: PlatformPostStatus;
  platformUrl: string | null;
  publishedAt: Date | null;
  failureReason: string | null;
}

export interface Post {
  postId: string;
  userId: string;
  uploadRef: string;
  ruleRef: string;
  contentRef: string;
  zernioPostId: string | null;
  channels: string[];
  scheduledAt: Date | null;
  publishedAt: Date | null;
  status: PostStatus;
  platformResults: PlatformResult[];
  retryCount: number;
  failureReason: string | null;
  publishedNow: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PostDocument = Post;
