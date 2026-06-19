import { Injectable } from '@nestjs/common';
import type { PostStatus, Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { IPostRepository, PostRecord } from '../interfaces/post.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaPostRepository implements IPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PostCreateInput): Promise<PostRecord> {
    return this.prisma.post.create({ data });
  }

  findByPostId(
    postId: string,
    auth?: TenancyAuth,
  ): Promise<PostRecord | null> {
    const where = auth ? mergeTenancyWhere({ postId }, auth) : { postId };
    return this.prisma.post.findFirst({ where });
  }

  findByZernioPostId(zernioPostId: string): Promise<PostRecord | null> {
    return this.prisma.post.findFirst({ where: { zernioPostId } });
  }

  findAllByZernioPostId(zernioPostId: string): Promise<PostRecord[]> {
    return this.prisma.post.findMany({ where: { zernioPostId } });
  }

  findByUploadRef(
    uploadRef: string,
    filters?: { status?: PostStatus },
  ): Promise<PostRecord[]> {
    return this.prisma.post.findMany({
      where: {
        uploadRef,
        ...(filters?.status ? { status: filters.status } : {}),
      },
    });
  }

  async findPage(
    filter: Prisma.PostWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: PostRecord[]; total: number }> {
    const orderBy = { [sortBy]: sortOrder } as Prisma.PostOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where: filter,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.post.count({ where: filter }),
    ]);
    return { rows, total };
  }

  count(where: Prisma.PostWhereInput): Promise<number> {
    return this.prisma.post.count({ where });
  }

  save(post: PostRecord): Promise<PostRecord> {
    return this.prisma.post.update({
      where: { postId: post.postId },
      data: {
        status: post.status,
        channels: post.channels,
        platformResults: post.platformResults as Prisma.InputJsonValue,
        scheduledAt: post.scheduledAt,
        publishedAt: post.publishedAt,
        retryCount: post.retryCount,
        failureReason: post.failureReason,
        publishedNow: post.publishedNow,
        zernioPostId: post.zernioPostId,
      },
    });
  }

  async updateById(
    postId: string,
    data: Prisma.PostUpdateInput,
  ): Promise<PostRecord | null> {
    try {
      return await this.prisma.post.update({ where: { postId }, data });
    } catch {
      return null;
    }
  }

  updateManyScheduledByUpload(
    uploadRef: string,
    data: Prisma.PostUpdateManyMutationInput,
  ): Promise<number> {
    return this.prisma.post
      .updateMany({
        where: { uploadRef, status: 'scheduled' },
        data,
      })
      .then((r) => r.count);
  }

  async deleteByPostId(postId: string): Promise<boolean> {
    try {
      await this.prisma.post.delete({ where: { postId } });
      return true;
    } catch {
      return false;
    }
  }

  findScheduledWithZernioId(): Promise<PostRecord[]> {
    return this.prisma.post.findMany({
      where: {
        status: 'scheduled',
        zernioPostId: { not: null },
      },
    });
  }

  async aggregateStatusCounts(
    where: Prisma.PostWhereInput,
  ): Promise<Partial<Record<PostStatus, number>>> {
    const rows = await this.prisma.post.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const out: Partial<Record<PostStatus, number>> = {};
    for (const row of rows) {
      out[row.status] = row._count._all;
    }
    return out;
  }
}
