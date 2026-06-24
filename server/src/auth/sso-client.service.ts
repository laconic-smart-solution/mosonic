import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import {
  AuthServiceUnavailableException,
  withSsoErrorMapping,
} from './sso-error.mapper';

@Injectable()
export class SsoClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 30_000,
    });
  }

  private baseUrl(): string {
    const base = this.config.get<string>('SSO_BASE_URL')?.trim();
    if (!base) {
      throw new AuthServiceUnavailableException('SSO_BASE_URL is not set');
    }
    return base.replace(/\/$/, '');
  }

  private applicationCode(): string {
    const code = this.config.get<string>('SSO_APPLICATION_CODE')?.trim();
    if (!code) {
      throw new AuthServiceUnavailableException(
        'SSO_APPLICATION_CODE is not set',
      );
    }
    return code;
  }

  async signUp(payload: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url =
        this.baseUrl() +
        `/v1/lcn-sso/auth/sign-up?applicationCode=${encodeURIComponent(
          this.applicationCode(),
        )}`;
      const res = await this.http.post(url, payload);
      return res.data;
    }, 'signup');
  }

  async login(payload: {
    username: string;
    password: string;
  }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/auth/login`;
      const res = await this.http.post(url, payload, {
        headers: {
          'X-Application-Code': this.applicationCode(),
        },
      });
      return this.normalizeAuthPayload(res.data);
    }, 'login');
  }

  async refresh(payload: { refreshToken: string }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/auth/refresh`;
      const res = await this.http.post(url, null, {
        params: { refreshToken: payload.refreshToken },
      });
      return this.normalizeAuthPayload(res.data);
    }, 'refresh');
  }

  private normalizeAuthPayload(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }
    const d = data as Record<string, unknown>;
    if ('data' in d && d.data !== undefined) {
      return data;
    }
    const hasAccess =
      typeof d.access_token === 'string' || typeof d.accessToken === 'string';
    const hasRefresh =
      typeof d.refresh_token === 'string' || typeof d.refreshToken === 'string';
    if (hasAccess || hasRefresh) {
      return { data };
    }
    return data;
  }

  async resendOtpByEmail(payload: { email: string }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/auth/resend-otp/email`;
      const res = await this.http.post(url, null, { params: payload });
      return res.data;
    }, 'otp');
  }

  async verifyOtp(payload: { email: string; otp: string }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/auth/verify/otp`;
      const res = await this.http.post(url, null, {
        params: {
          email: payload.email,
          otp: payload.otp,
          applicationCode: this.applicationCode(),
        },
      });
      return this.normalizeAuthPayload(res.data);
    }, 'otp');
  }

  async changePassword(payload: {
    accessToken: string;
    newPassword: string;
  }): Promise<unknown> {
    return withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/auth/change-password`;
      const res = await this.http.post(
        url,
        { newPassword: payload.newPassword },
        {
          params: { accessToken: payload.accessToken },
        },
      );
      return res.data;
    }, 'refresh');
  }

  async deleteUser(authServerUserId: string): Promise<void> {
    await withSsoErrorMapping(async () => {
      const url = this.baseUrl() + `/v1/lcn-sso/user/${authServerUserId}`;
      await this.http.delete(url);
    }, 'generic');
  }
}
