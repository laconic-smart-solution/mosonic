import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';

@Injectable()
export class FileProxyService {
  constructor(private readonly config: ConfigService) {}

  private requireFileServiceUrl(): string {
    const baseUrl = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'FILE_SERVICE_URL is not set; cannot proxy file download',
      );
    }
    return baseUrl.replace(/\/+$/, '');
  }

  async fetchFile(relativePath: string): Promise<{
    status: number;
    stream?: Readable;
    contentType?: string;
    contentLength?: string;
    contentDisposition?: string;
  }> {
    const baseUrl = this.requireFileServiceUrl();
    const url = `${baseUrl}/file?relativePath=${encodeURIComponent(relativePath)}`;
    const response = await fetch(url);

    const body = response.body;
    const stream = body ? Readable.fromWeb(body as ReadableStream) : undefined;

    return {
      status: response.status,
      stream,
      contentType: response.headers.get('content-type') ?? undefined,
      contentLength: response.headers.get('content-length') ?? undefined,
      contentDisposition:
        response.headers.get('content-disposition') ?? undefined,
    };
  }
}
