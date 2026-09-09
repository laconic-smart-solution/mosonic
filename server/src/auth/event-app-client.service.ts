import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';

export interface EventAppUserInfo {
  valid: boolean;
  localUserId?: number;
  authServerUserId?: string;
  email: string;
  username?: string;
  name?: string;
  organizationId?: number;
  organizationName?: string;
  role?: string;
  redirectPath?: string;
}

@Injectable()
export class EventAppClientService {
  private readonly logger = new Logger(EventAppClientService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 10_000,
    });
  }

  private baseUrl(): string {
    const base =
      this.config.get<string>('EVENT_BACKEND_URL')?.trim() ||
      this.config.get<string>('COMPETITION_EVENT_SERVICE_URL')?.trim() ||
      'http://localhost:8080';
    return base.replace(/\/$/, '');
  }

  private apiKey(): string {
    return (
      this.config.get<string>('EVENT_APP_INTERNAL_API_KEY')?.trim() ||
      this.config.get<string>('MOSONIC_INTERNAL_API_KEY')?.trim() ||
      ''
    );
  }

  /**
   * Validates and consumes the single-use authorization code from Event App backend.
   */
  async validateExchangeCode(code: string): Promise<EventAppUserInfo> {
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'MissingCode',
        message: 'Authorization code is required',
      });
    }

    const cleanCode = code.trim();
    const url = `${this.baseUrl()}/v1/internal/mosonic/validate-code`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const key = this.apiKey();
    if (key) {
      headers['X-Mosonic-Api-Key'] = key;
    }

    try {
      this.logger.debug(`Validating exchange code with Event App at ${url}`);
      const res = await this.http.post(url, { code: cleanCode }, { headers });
      const payload = res.data?.data as EventAppUserInfo;

      if (!payload || !payload.email) {
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'InvalidCodePayload',
          message:
            'Invalid response received from Event App authentication backend',
        });
      }

      this.logger.log(
        `Successfully validated exchange code for user ${payload.email}`,
      );
      return payload;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Failed to validate exchange code with Event App';
        this.logger.warn(
          `Event App code validation failed [HTTP ${status}]: ${msg}`,
        );
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'InvalidExchangeCode',
          message: msg,
        });
      }
      this.logger.error('Unexpected error validating exchange code', err);
      throw err;
    }
  }
}
