import type { PostStatus, Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { Post } from '@prisma/client';

export type PostRecord = Post;

export interface IPostRepository {
  create(data: Prisma.PostCreateInput): Promise<PostRecord>;
  findByPostId(postId: string, auth?: TenancyAuth): Promise<PostRecord | null>;
  findByZernioPostId(zernioPostId: string): Promise<PostRecord | null>;
  findAllByZernioPostId(zernioPostId: string): Promise<PostRecord[]>;
  findByUploadRef(
    uploadRef: string,
    filters?: { status?: PostStatus },
  ): Promise<PostRecord[]>;
  findPage(
    filter: Prisma.PostWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: PostRecord[]; total: number }>;
  count(where: Prisma.PostWhereInput): Promise<number>;
  save(post: PostRecord): Promise<PostRecord>;
  updateById(
    postId: string,
    data: Prisma.PostUpdateInput,
  ): Promise<PostRecord | null>;
  updateManyScheduledByUpload(
    uploadRef: string,
    data: Prisma.PostUpdateManyMutationInput,
  ): Promise<number>;
  deleteByPostId(postId: string): Promise<boolean>;
  findScheduledWithZernioId(): Promise<PostRecord[]>;
  aggregateStatusCounts(
    where: Prisma.PostWhereInput,
  ): Promise<Partial<Record<PostStatus, number>>>;
}
