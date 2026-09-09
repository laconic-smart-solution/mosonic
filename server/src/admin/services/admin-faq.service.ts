import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { FileProxyService } from '../../content/file-proxy.service';
import { buildFileStorageFolderPath } from '../../common/utils/file-storage-path.util';
import { uploadBufferToFileService } from '../../upload/file-service-upload.util';
import { FaqClientService } from '../../faq/faq-client.service';

type FaqDocumentResponse = {
  id: string;
  filename: string;
  content_type: string | null;
  file_size: number;
  uploaded_by: string;
  status: string;
  faq_count: number;
  error_message: string | null;
  storage_path: string | null;
  created_at: string;
};

@Injectable()
export class AdminFaqService {
  constructor(
    private readonly client: FaqClientService,
    private readonly fileProxy: FileProxyService,
    private readonly config: ConfigService,
  ) {}

  listDocuments(params: { page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    return this.client.get(`/documents?page=${page}&limit=${limit}`);
  }

  getDocument(documentId: string) {
    return this.client.get<FaqDocumentResponse>(`/documents/${documentId}`);
  }

  listDocumentFaqs(
    documentId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    return this.client.get(
      `/documents/${documentId}/faqs?page=${page}&limit=${limit}`,
    );
  }

  listFaqs(params: {
    page?: number;
    limit?: number;
    q?: string;
    activeOnly?: boolean;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const q = params.q?.trim();
    const activeOnly = params.activeOnly ?? true;
    const search = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      active_only: String(activeOnly),
    });
    if (q) search.set('q', q);
    return this.client.get(`/faqs?${search.toString()}`);
  }

  ask(question: string, topK?: number) {
    return this.client.postJson('/faqs/ask', {
      question,
      ...(topK != null ? { top_k: topK } : {}),
    });
  }

  async uploadDocument(params: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    createdBy: string;
  }) {
    const fileServiceBase = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    if (!fileServiceBase) {
      throw new ServiceUnavailableException('FILE_SERVICE_URL is not set');
    }

    const uploaded = await uploadBufferToFileService({
      fileServiceBase,
      buffer: Uint8Array.from(params.buffer),
      originalName: params.filename,
      mimeType: params.mimeType,
      folderPath: buildFileStorageFolderPath('faq-documents'),
    });

    return this.client.postGenerateFaqs({
      buffer: params.buffer,
      filename: params.filename,
      mimeType: params.mimeType,
      storagePath: uploaded.relativePath,
      createdBy: params.createdBy,
    });
  }

  async downloadDocument(documentId: string, res: Response) {
    const doc = await this.getDocument(documentId);
    if (!doc.storage_path?.trim()) {
      throw new NotFoundException(
        'Document file is not available for download',
      );
    }

    const proxied = await this.fileProxy.fetchFile(doc.storage_path);
    if (proxied.status !== 200 || !proxied.stream) {
      throw new NotFoundException('Document file not found in storage');
    }

    res.status(200);
    res.setHeader(
      'Content-Type',
      proxied.contentType ?? doc.content_type ?? 'application/octet-stream',
    );
    if (proxied.contentLength) {
      res.setHeader('Content-Length', proxied.contentLength);
    }
    res.setHeader(
      'Content-Disposition',
      proxied.contentDisposition ??
        `attachment; filename="${encodeURIComponent(doc.filename)}"`,
    );
    proxied.stream.pipe(res);
  }
}
