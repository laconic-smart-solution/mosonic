import { UploadChannelStatus, UploadJobStatus } from '../schemas/upload.schema';

export type UploadChannelStatusDto = {
  channel: string;
  status: UploadChannelStatus;
  caption: string;
  mediaUrl: string | null;
  mediaUrls: string[];
  youtubeTitle?: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
};

export type UploadStatusSummaryDto = {
  total: number;
  publishing: number;
  scheduled: number;
  published: number;
  failed: number;
  skipped: number;
};

export type UploadStatusDto = {
  uploadId: string;
  status: UploadJobStatus;
  channels: UploadChannelStatusDto[];
  summary: UploadStatusSummaryDto;
};
