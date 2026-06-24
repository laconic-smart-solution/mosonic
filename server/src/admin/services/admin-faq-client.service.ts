import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance, isAxiosError } from 'axios';

@Injectable()
export class AdminFaqClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 120_000,
    });
  }

  private baseUrl(): string {
    const base = this.config.get<string>('FAQ_SERVICE_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException('FAQ_SERVICE_URL is not set');
    }
    return base.replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = this.config.get<string>('FAQ_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('FAQ_API_KEY is not set');
    }
    return key;
  }

  private headers(createdBy?: string): Record<string, string> {
    const h: Record<string, string> = {
      'X-FAQ-API-Key': this.apiKey(),
    };
    if (createdBy?.trim()) {
      h['X-Created-By'] = createdBy.trim();
    }
    return h;
  }

  private mapError(error: unknown): never {
    if (isAxiosError(error)) {
      const detail =
        typeof error.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response?.data ?? error.message);
      throw new BadGatewayException(
        detail || `FAQ service error (${error.response?.status ?? 'unknown'})`,
      );
    }
    throw error;
  }

  async get<T>(path: string, createdBy?: string): Promise<T> {
    try {
      const res = await this.http.get<T>(`${this.baseUrl()}${path}`, {
        headers: this.headers(createdBy),
      });
      return res.data;
    } catch (error) {
      this.mapError(error);
    }
  }

  async postJson<T>(
    path: string,
    body: unknown,
    createdBy?: string,
  ): Promise<T> {
    try {
      const res = await this.http.post<T>(`${this.baseUrl()}${path}`, body, {
        headers: {
          ...this.headers(createdBy),
          'Content-Type': 'application/json',
        },
      });
      return res.data;
    } catch (error) {
      this.mapError(error);
    }
  }

  async postGenerateFaqs(params: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    storagePath: string;
    createdBy?: string;
  }): Promise<unknown> {
    try {
      const form = new FormData();
      const blob = new Blob([Uint8Array.from(params.buffer)], {
        type: params.mimeType || 'application/octet-stream',
      });
      form.append('file', blob, params.filename);

      const res = await this.http.post(
        `${this.baseUrl()}/documents/generate-faqs`,
        form,
        {
          headers: {
            ...this.headers(params.createdBy),
            'X-Storage-Path': params.storagePath,
          },
        },
      );
      return res.data;
    } catch (error) {
      this.mapError(error);
    }
  }
}
