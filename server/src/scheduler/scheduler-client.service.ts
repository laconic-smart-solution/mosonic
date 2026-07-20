import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import type { SchedulerApiResponse } from './scheduler.types';

@Injectable()
export class SchedulerClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 30_000,
    });
  }

  private baseUrl(): string {
    const base = this.config.get<string>('SCHEDULER_SERVICE_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException('SCHEDULER_SERVICE_URL is not set');
    }
    return base.replace(/\/+$/, '');
  }

  private apiKey(): string {
    const key = this.config.get<string>('SCHEDULER_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException('SCHEDULER_API_KEY is not set');
    }
    return key;
  }

  private headers(): Record<string, string> {
    return {
      'X-Scheduler-API-Key': this.apiKey(),
      'Content-Type': 'application/json',
    };
  }

  private unwrap<T>(payload: SchedulerApiResponse<T>): T {
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
          `Scheduler service error (${error.response?.status ?? 'unknown'})`,
      );
    }
    throw error;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    try {
      const res = await this.http.post<SchedulerApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        body,
        { headers: this.headers() },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }

  async putJson<T>(path: string, body: unknown): Promise<T> {
    try {
      const res = await this.http.put<SchedulerApiResponse<T>>(
        `${this.baseUrl()}${path}`,
        body,
        { headers: this.headers() },
      );
      return this.unwrap(res.data);
    } catch (error) {
      this.mapError(error);
    }
  }

  async delete(path: string): Promise<void> {
    try {
      await this.http.delete(`${this.baseUrl()}${path}`, {
        headers: this.headers(),
      });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return;
      }
      this.mapError(error);
    }
  }
}
