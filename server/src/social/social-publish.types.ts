export type PublishPayload = {
  userId: string;
  postId: string;
  uploadId?: string;
  channel: string;
  caption: string;
  mediaUrls: string[];
  scheduledAt?: string | null;
};

export type PublishResult = {
  success: boolean;
  confirmationMethod: 'api' | 'dom_scrape';
  externalPostRef?: string | null;
  needsManualVerification?: boolean;
  jobId?: string;
};
