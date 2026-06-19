import { UploadStatus as PrismaUploadStatus } from '@prisma/client';
import type { ContentOutputs } from '../../content/schemas/content.schema';

export enum UploadChannelStatus {
  Pending = 'pending',
  Publishing = 'publishing',
  Scheduled = 'scheduled',
  Published = 'published',
  Failed = 'failed',
  Skipped = 'skipped',
}

export const UploadJobStatus = {
  ...PrismaUploadStatus,
  Pending: PrismaUploadStatus.pending,
  Running: PrismaUploadStatus.running,
  Partial: PrismaUploadStatus.partial,
  Completed: PrismaUploadStatus.completed,
  Failed: PrismaUploadStatus.failed,
} as const;

export type UploadJobStatus =
  (typeof UploadJobStatus)[keyof typeof UploadJobStatus];

export interface UploadChannelEntry {
  channel: string;
  included: boolean;
  caption: string;
  mediaUrl: string | null;
  mediaUrls: string[];
  youtubeTitle: string | null;
  status: UploadChannelStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  retryCount: number;
  failureReason: string | null;
  variantId?: string | null;
}

export interface Upload {
  uploadId: string;
  userId?: string;
  contentRef: string;
  workflowRef: string;
  ruleRef: string;
  channels: UploadChannelEntry[];
  status: UploadJobStatus;
  resolvedOutputs?: ContentOutputs;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UploadDocument = Upload;
