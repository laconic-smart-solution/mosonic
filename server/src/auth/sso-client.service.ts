import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';

@Injectable()
export class SsoClientService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      timeout: 30_000,
      // NOTE: baseURL intentionally omitted because some envs may include path segments.
    });
  }

  private baseUrl(): string {
    const base = this.config.get<string>('SSO_BASE_URL')?.trim();
    if (!base) {
      throw new Error('SSO_BASE_URL is not set');
    }
    return base.replace(/\/$/, '');
  }

  private applicationCode(): string {
    const code = this.config.get<string>('SSO_APPLICATION_CODE')?.trim();
    if (!code) {
      throw new Error('SSO_APPLICATION_CODE is not set');
    }
    return code;
  }

  async signUp(payload: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<unknown> {
    const url =
      this.baseUrl() +
      `/v1/lcn-sso/auth/sign-up?applicationCode=${encodeURIComponent(
        this.applicationCode(),
      )}`;
    const res = await this.http.post(url, payload);
    return res.data;
  }

  async login(payload: {
    username: string;
    password: string;
  }): Promise<unknown> {
    const url = this.baseUrl() + `/v1/lcn-sso/auth/login`;
    const res = await this.http.post(url, payload, {
      headers: {
        'X-Application-Code': this.applicationCode(),
      },
    });
    return res.data;
  }

  async refresh(payload: { refreshToken: string }): Promise<unknown> {
    const url = this.baseUrl() + `/v1/lcn-sso/auth/refresh`;
    const res = await this.http.post(url, null, {
      params: { refreshToken: payload.refreshToken },
    });
    return res.data;
  }

  async resendOtpByEmail(payload: { email: string }): Promise<unknown> {
    const url = this.baseUrl() + `/v1/lcn-sso/auth/resend-otp/email`;
    const res = await this.http.post(url, null, { params: payload });
    return res.data;
  }

  async deleteUser(authServerUserId: string): Promise<void> {
    const url = this.baseUrl() + `/v1/lcn-sso/user/${authServerUserId}`;
    await this.http.delete(url);
  }
}
