import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { Upload } from '@prisma/client';

export type UploadRecord = Upload;

export interface IUploadRepository {
  create(data: Prisma.UploadCreateInput): Promise<UploadRecord>;
  findByUploadId(uploadId: string): Promise<UploadRecord | null>;
  findByUploadIdScoped(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadRecord | null>;
  findLatestByContentRef(
    contentRef: string,
    auth: TenancyAuth,
  ): Promise<UploadRecord | null>;
  findByContentRefs(
    contentRefs: string[],
    auth: TenancyAuth,
  ): Promise<UploadRecord[]>;
  findByUploadIds(uploadIds: string[]): Promise<UploadRecord[]>;
  findAllScoped(auth: TenancyAuth): Promise<UploadRecord[]>;
  save(upload: UploadRecord): Promise<UploadRecord>;
  updateById(
    uploadId: string,
    data: Prisma.UploadUpdateInput,
  ): Promise<UploadRecord | null>;
}
