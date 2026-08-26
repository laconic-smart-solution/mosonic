import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import type { PaymentApiResponse } from './payment.types';

@Injectable()
export class PaymentClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 30_000,
    });
  }

  private baseUrl(): string {
    const base = this.config.get<string>('PAYMENT_SERVICE_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException('PAYMENT_SERVICE_URL is not set');
    }
    return base.replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = this.config.get<string>('PAYMENT_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('PAYMENT_API_KEY is not set');
    }
    return key;
  }

  private headers(createdBy?: string): Record<string, string> {
    const h: Record<string, string> = {
      'X-Payment-API-Key': this.apiKey(),
    };
    if (createdBy?.trim()) {
      h['X-Created-By'] = createdBy.trim();
    }
    return h;
  }

  private unwrap<T>(payload: PaymentApiResponse<T>): T {
    return payload.data;
  }

  private mapError(error: unknown): never {
    if (isAxiosError(error)) {
      const detail =
        typeof error.response?.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response?.data ?? error.message);
      throw new BadGatewayException(
        detail ||
          `Payment service error (${error.response?.status ?? 'unknown'})`,
      );
    }
    throw error;
  }

  async get<T>(path: string, createdBy?: string): Promise<T> {
    try {
      const res = await this.http.get<PaymentApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        {
          headers: this.headers(createdBy),
        },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }

  async getOptional<T>(path: string, createdBy?: string): Promise<T | null> {
    try {
      const res = await this.http.get<PaymentApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        {
          headers: this.headers(createdBy),
        },
      );
      return this.unwrap(res.data);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.mapError(error);
    }
  }

  async postJson<T>(
    path: string,
    body: unknown,
    createdBy?: string,
  ): Promise<T> {
    try {
      const res = await this.http.post<PaymentApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        body,
        {
          headers: {
            ...this.headers(createdBy),
            'Content-Type': 'application/json',
          },
        },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }

  async putJson<T>(
    path: string,
    body: unknown,
    createdBy?: string,
  ): Promise<T> {
    try {
      const res = await this.http.put<PaymentApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        body,
        {
          headers: {
            ...this.headers(createdBy),
            'Content-Type': 'application/json',
          },
        },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }

  async patchJson<T>(
    path: string,
    body: unknown,
    createdBy?: string,
  ): Promise<T> {
    try {
      const res = await this.http.patch<PaymentApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        body,
        {
          headers: {
            ...this.headers(createdBy),
            'Content-Type': 'application/json',
          },
        },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }
}
