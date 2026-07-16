import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LINE_EVENT_FOLLOW,
  type LineInboundEvent,
  type LineQrCode,
} from './line.types';

type LineServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for adding us! 🎉 Send us a message any time and our team will get back to you.';

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);

  constructor(private readonly config: ConfigService) {}

  /** Base URL of line-service, either direct (:8083) or through the comms gateway. */
  private get baseUrl(): string {
    return (
      this.config.get<string>('LINE_SERVICE_URL')?.trim().replace(/\/$/, '') ??
      'http://localhost:8083'
    );
  }

  get basicId(): string {
    return this.config.get<string>('LINE_BASIC_ID')?.trim() || '@136laxkx';
  }

  private get welcomeMessage(): string {
    return (
      this.config.get<string>('LINE_WELCOME_MESSAGE')?.trim() || DEFAULT_WELCOME
    );
  }

  /** Identity line-service expects from a server-to-server caller. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Gateway-Secret':
        this.config.get<string>('COMMUNICATION_GATEWAY_SECRET')?.trim() ?? '',
      'X-Tenant-ID':
        this.config.get<string>('LINE_TENANT_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000001',
      'X-Actor-ID':
        this.config.get<string>('LINE_ACTOR_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000002',
      ...extra,
    };
  }

  /**
   * line-service is stateless: it never stores LINE credentials, so the channel
   * access token travels on every call that actually reaches LINE. QR rendering
   * does not, and must not require a token to be configured.
   */
  private sendHeaders(): Record<string, string> {
    const accessToken = this.config
      .get<string>('LINE_CHANNEL_ACCESS_TOKEN')
      ?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'LINE_CHANNEL_ACCESS_TOKEN is not configured',
      );
    }

    return this.headers({
      'Content-Type': 'application/json',
      'X-Line-Channel-Access-Token': accessToken,
    });
  }

  async getQrCode(basicId?: string, size?: number): Promise<LineQrCode> {
    const url = this.qrUrl(basicId, size, 'json');
    const res = await this.fetchLine(url);
    const body = (await res.json()) as LineServiceEnvelope<{
      basic_id: string;
      add_friend_url: string;
      qr_image: string;
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw this.qrError(res.status, body.error);
    }

    return {
      basicId: body.data.basic_id,
      addFriendUrl: body.data.add_friend_url,
      qrImage: body.data.qr_image,
    };
  }

  async getQrPng(basicId?: string, size?: number): Promise<Buffer> {
    const res = await this.fetchLine(this.qrUrl(basicId, size));
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as LineServiceEnvelope<unknown>;
      throw this.qrError(res.status, body.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * line-service validates basic_id and size, so its 4xx means the caller sent
   * something bad — surfacing that as 503 would blame the wrong side.
   */
  private qrError(status: number, error?: string): Error {
    const message = error ?? `line-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    const res = await this.fetchLine(`${this.baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, text }),
    });

    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as LineServiceEnvelope<unknown>;
      throw new ServiceUnavailableException(
        body.error ?? `line-service returned HTTP ${res.status}`,
      );
    }
  }

  /**
   * LINE has no "accept friend request" API — a follow is already final, so the
   * only thing to automate is greeting the new friend.
   */
  async handleEvents(events: LineInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type !== LINE_EVENT_FOLLOW || !event.user_id) {
        continue;
      }
      try {
        await this.sendText(event.user_id, this.welcomeMessage);
        this.logger.log(`Sent welcome message to LINE user ${event.user_id}`);
      } catch (err) {
        this.logger.error(
          `Failed to welcome LINE user ${event.user_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private qrUrl(basicId?: string, size?: number, format?: 'json'): string {
    const params = new URLSearchParams({
      basic_id: basicId?.trim() || this.basicId,
    });
    if (size) params.set('size', String(size));
    if (format) params.set('format', format);
    return `${this.baseUrl}/api/v1/qr?${params.toString()}`;
  }

  private async fetchLine(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { headers: this.headers(), ...init });
    } catch (err) {
      this.logger.error(
        `line-service unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('line-service is unreachable');
    }
  }
}
