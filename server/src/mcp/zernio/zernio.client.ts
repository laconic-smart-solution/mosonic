import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type ZernioProfileDto = { _id: string; name: string };

type ZernioCreateProfileResponse = { profile: ZernioProfileDto };

type ZernioConnectResponse = { authUrl: string };

type ZernioListAccountsResponse = { accounts: unknown };

@Injectable()
export class ZernioClient {
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

  async createProfile(name: string): Promise<ZernioProfileDto> {
    const res = await axios.post<ZernioCreateProfileResponse>(
      `${this.base}/profiles`,
      { name },
      { headers: this.headers },
    );
    return res.data.profile;
  }

  async getConnectUrl(platform: string, profileId: string): Promise<string> {
    const res = await axios.get<ZernioConnectResponse>(
      `${this.base}/connect/${platform}`,
      {
        params: {
          profileId,
          redirect_url: this.callbackUrl,
        },
        headers: this.headers,
      },
    );
    return res.data.authUrl;
  }

  async listAccounts(profileId: string): Promise<unknown> {
    const res = await axios.get<ZernioListAccountsResponse>(
      `${this.base}/accounts`,
      {
        params: { profileId },
        headers: this.headers,
      },
    );
    return res.data.accounts;
  }
}
