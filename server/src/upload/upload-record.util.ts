import type { Prisma } from '@prisma/client';
import type { PostRecord } from '../repositories/interfaces/post.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import type { PlatformResult } from '../post/schemas/post.schema';
import type { UploadChannelEntry } from './schemas/upload.schema';

export function uploadChannels(upload: UploadRecord): UploadChannelEntry[] {
  if (!Array.isArray(upload.channels)) return [];
  return upload.channels as unknown as UploadChannelEntry[];
}

export function withUploadChannels(
  upload: UploadRecord,
  channels: UploadChannelEntry[],
): UploadRecord {
  return {
    ...upload,
    channels: channelsToJson(channels) as UploadRecord['channels'],
  };
}

export function postPlatformResults(post: PostRecord): PlatformResult[] {
  if (!Array.isArray(post.platformResults)) return [];
  return post.platformResults as unknown as PlatformResult[];
}

export function channelsToJson(
  channels: UploadChannelEntry[],
): Prisma.InputJsonValue {
  return channels as unknown as Prisma.InputJsonValue;
}

export function withPostPlatformResults(
  post: PostRecord,
  platformResults: PlatformResult[],
): PostRecord {
  return {
    ...post,
    platformResults:
      platformResults as unknown as PostRecord['platformResults'],
  };
}
