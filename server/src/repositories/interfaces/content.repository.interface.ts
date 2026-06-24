import type { ContentStatus, Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type {
  ContentOutputs,
  ContentRecord,
  ContentUserEdits,
} from '../../domain/content/content.types';
import type { ContentPageItemDto, ContentPageQueryDto } from '../../content/dto/content-page-query.dto';

export interface IContentRepository {
  findById(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null>;
  findByIdLean(
    contentId: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null>;
  findByContentId(contentId: string): Promise<ContentRecord | null>;
  findLatestByPipeline(
    pipelineRef: string,
    auth: TenancyAuth,
  ): Promise<ContentRecord | null>;
  create(data: Prisma.ContentCreateInput): Promise<ContentRecord>;
  findPage(
    query: ContentPageQueryDto,
    auth: TenancyAuth,
  ): Promise<{ data: ContentPageItemDto[]; total: number }>;
  getStats(auth: TenancyAuth): Promise<{
    total: number;
    byStatus: Partial<Record<ContentStatus, number>>;
  }>;
  updateEditableState(
    contentId: string,
    payload: {
      outputs?: ContentOutputs;
      userEdits?: ContentUserEdits;
      nodePromptOverrides?: Record<string, string>;
      nodeOutputs?: Record<string, Record<string, unknown>>;
      nodeUserEdits?: Record<string, Record<string, unknown>>;
    },
    auth: TenancyAuth,
  ): Promise<{ matchedCount: number }>;
  updateStatus(
    contentId: string,
    status: ContentStatus,
    auth: TenancyAuth,
  ): Promise<void>;
  countDrafts(auth: TenancyAuth): Promise<number>;
  countSince(createdAtGte: Date): Promise<number>;
  findRecent(
    auth: TenancyAuth,
    limit: number,
  ): Promise<ContentRecord[]>;
  findPageAdmin(
    filter: Prisma.ContentWhereInput,
    page: number,
    limit: number,
  ): Promise<{ rows: ContentRecord[]; total: number }>;
}
