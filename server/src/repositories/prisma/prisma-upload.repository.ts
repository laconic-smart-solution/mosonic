import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { UploadRecord } from '../interfaces/upload.repository.interface';
import type { IUploadRepository } from '../interfaces/upload.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaUploadRepository implements IUploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UploadCreateInput): Promise<UploadRecord> {
    return this.prisma.upload.create({ data });
  }

  findByUploadId(uploadId: string): Promise<UploadRecord | null> {
    return this.prisma.upload.findUnique({ where: { uploadId } });
  }

  findByUploadIdScoped(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadRecord | null> {
    return this.prisma.upload.findFirst({
      where: mergeTenancyWhere({ uploadId }, auth),
    });
  }

  findLatestByContentRef(
    contentRef: string,
    auth: TenancyAuth,
  ): Promise<UploadRecord | null> {
    return this.prisma.upload.findFirst({
      where: mergeTenancyWhere({ contentRef }, auth),
      orderBy: { createdAt: 'desc' },
    });
  }

  findByContentRefs(
    contentRefs: string[],
    auth: TenancyAuth,
  ): Promise<UploadRecord[]> {
    return this.prisma.upload.findMany({
      where: mergeTenancyWhere({ contentRef: { in: contentRefs } }, auth),
    });
  }

  findByUploadIds(uploadIds: string[]): Promise<UploadRecord[]> {
    return this.prisma.upload.findMany({
      where: { uploadId: { in: uploadIds } },
    });
  }

  findAllScoped(auth: TenancyAuth): Promise<UploadRecord[]> {
    return this.prisma.upload.findMany({
      where: mergeTenancyWhere({}, auth),
    });
  }

  save(upload: UploadRecord): Promise<UploadRecord> {
    return this.prisma.upload.update({
      where: { uploadId: upload.uploadId },
      data: {
        channels: upload.channels as Prisma.InputJsonValue,
        status: upload.status,
        resolvedOutputs: upload.resolvedOutputs as Prisma.InputJsonValue,
        workflowRef: upload.workflowRef,
        ruleRef: upload.ruleRef,
        contentRef: upload.contentRef,
      },
    });
  }

  async updateById(
    uploadId: string,
    data: Prisma.UploadUpdateInput,
  ): Promise<UploadRecord | null> {
    try {
      return await this.prisma.upload.update({ where: { uploadId }, data });
    } catch {
      return null;
    }
  }
}
