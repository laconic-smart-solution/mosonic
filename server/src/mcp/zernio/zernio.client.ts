import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';

export type ZernioProfileDto = {
  _id: string;
  name: string;
  isDefault?: boolean;
  overLimit?: boolean;
};

type ZernioCreateProfileResponse = { profile: ZernioProfileDto };

type ZernioListProfilesResponse = { profiles: ZernioProfileDto[] };

type ZernioConnectResponse = { authUrl: string };

type ZernioListAccountsResponse = { accounts: unknown };

export class ZernioClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ZernioClientError';
  }
}

function readZernioErrorBody(data: unknown): {
  error?: string;
  code?: string;
} {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  return {
    error: typeof record.error === 'string' ? record.error : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
  };
}

/** Deterministic Zernio profile name — one profile per Mosonic user. */
export function buildZernioProfileNameForUser(userId: string): string {
  return `mosonic:${userId.trim()}`;
}

/** @deprecated Do not reuse org-wide profiles; use buildZernioProfileNameForUser + createProfile. */
export function pickZernioProfileForUser(
  profiles: readonly ZernioProfileDto[],
  preferredName: string,
): ZernioProfileDto | null {
  if (!profiles.length) return null;

  const norm = preferredName.trim().toLowerCase();
  if (norm) {
    const byName = profiles.find(
      (profile) => profile.name.trim().toLowerCase() === norm,
    );
    if (byName) return byName;
  }

  const defaultProfile = profiles.find((profile) => profile.isDefault);
  if (defaultProfile) return defaultProfile;

  return profiles[0] ?? null;
}

@Injectable()
export class ZernioClient {
  private readonly logger = new Logger(ZernioClient.name);
  private readonly base = 'https://zernio.com/api/v1';

  constructor(private readonly config: ConfigService) {}

  private get headers() {
    const key = this.config.get<string>('ZERNIO_API_KEY');
    if (!key) {
      throw new Error('ZERNIO_API_KEY is not set');
    }
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
  }

  private get callbackUrl() {
    const url = this.config.get<string>('ZERNIO_CALLBACK_URL');
    if (!url) {
      throw new Error('ZERNIO_CALLBACK_URL is not set');
    }
    return url;
  }

  private wrapAxiosError(err: unknown, action: string): never {
    if (!isAxiosError(err)) {
      throw err;
    }

    const status = err.response?.status;
    const { error, code } = readZernioErrorBody(err.response?.data);
    const detail = error ?? err.message ?? action;

    this.logger.warn(
      `Zernio ${action} failed${status ? ` (${status})` : ''}: ${detail}`,
    );

    if (status === 402 || code === 'PAYMENT_REQUIRED') {
      throw new ZernioClientError(
        error ??
          'Zernio free tier limit reached. Add a payment method on Zernio to connect more accounts.',
        status,
        code,
      );
    }

    throw new ZernioClientError(detail, status, code);
  }

  async listProfiles(includeOverLimit = true): Promise<ZernioProfileDto[]> {
    try {
      const res = await axios.get<ZernioListProfilesResponse>(
        `${this.base}/profiles`,
        {
          params: { includeOverLimit },
          headers: this.headers,
        },
      );
      const raw = res.data.profiles;
      if (!Array.isArray(raw)) return [];
      const profiles: ZernioProfileDto[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const id = typeof record._id === 'string' ? record._id.trim() : '';
        if (!id) continue;
        profiles.push({
          _id: id,
          name:
            typeof record.name === 'string' && record.name.trim()
              ? record.name.trim()
              : 'Profile',
          isDefault: record.isDefault === true,
          overLimit:
            record.overLimit === true ||
            record.isOverLimit === true ||
            record.over_limit === true,
        });
      }
      return profiles;
    } catch (err: unknown) {
      this.wrapAxiosError(err, 'listProfiles');
    }
  }

  async createProfile(name: string): Promise<ZernioProfileDto> {
    try {
      const res = await axios.post<ZernioCreateProfileResponse>(
        `${this.base}/profiles`,
        { name },
        { headers: this.headers },
      );
      return res.data.profile;
    } catch (err: unknown) {
      this.wrapAxiosError(err, 'createProfile');
    }
  }

  async getConnectUrl(
    platform: string,
    profileId: string,
    redirectUrlOverride?: string,
  ): Promise<string> {
    const redirect_url = redirectUrlOverride ?? this.callbackUrl;
    try {
      const res = await axios.get<ZernioConnectResponse>(
        `${this.base}/connect/${platform}`,
        {
          params: {
            profileId,
            redirect_url,
          },
          headers: this.headers,
        },
      );
      return res.data.authUrl;
    } catch (err: unknown) {
      this.wrapAxiosError(err, `getConnectUrl(${platform})`);
    }
  }

  async listAccounts(profileId: string): Promise<unknown> {
    try {
      const res = await axios.get<ZernioListAccountsResponse>(
        `${this.base}/accounts`,
        {
          params: { profileId },
          headers: this.headers,
        },
      );
      return res.data.accounts;
    } catch (err: unknown) {
      this.wrapAxiosError(err, 'listAccounts');
    }
  }
}
