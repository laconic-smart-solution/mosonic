import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ViberConnectCodeService } from './viber-connect-code.service';
import { ViberConnectionService } from './viber-connection.service';
import {
  VIBER_EVENT_FOLLOW,
  VIBER_EVENT_MESSAGE,
  VIBER_EVENT_UNFOLLOW,
  type ViberInboundEvent,
  type ViberQrCode,
} from './viber.types';

type ViberServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for starting the bot! Send CONNECT <code> from Mosonic settings to link your account.';

const CONNECT_CODE_RE = /^\s*CONNECT\s+([A-Za-z0-9]{4,12})\s*$/i;

export type ViberConnectStartResponse = {
  connected: boolean;
  code?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
  viberUserId?: string;
  connectedAt?: string;
  uri: string;
  botUrl: string;
  qrImage: string;
};

export type ViberConnectStatusResponse = {
  connected: boolean;
  viberUserId?: string;
  connectedAt?: string;
  pendingCode?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
};

@Injectable()
export class ViberService {
  private readonly logger = new Logger(ViberService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectCodes: ViberConnectCodeService,
    private readonly connections: ViberConnectionService,
  ) {}

  private get botToken(): string {
    const token = this.config.get<string>('VIBER_AUTH_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'VIBER_AUTH_TOKEN is not configured',
      );
    }
    return token;
  }

  /** Base URL of viber-service, either direct (:8088) or through the comms gateway. */
  private get baseUrl(): string {
    return (
      this.config
        .get<string>('VIBER_SERVICE_URL')
        ?.trim()
        .replace(/\/$/, '') ?? 'http://localhost:8088'
    );
  }

  /** Public account URI — no forced @ prefix (unlike Telegram usernames). */
  get uri(): string {
    return this.config.get<string>('VIBER_URI')?.trim() || 'MosonicBot';
  }

  private get welcomeMessage(): string {
    return (
      this.config.get<string>('VIBER_WELCOME_MESSAGE')?.trim() ||
      DEFAULT_WELCOME
    );
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Gateway-Secret':
        this.config.get<string>('COMMUNICATION_GATEWAY_SECRET')?.trim() ?? '',
      'X-Tenant-ID':
        this.config.get<string>('VIBER_TENANT_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000001',
      'X-Actor-ID':
        this.config.get<string>('VIBER_ACTOR_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000002',
      ...extra,
    };
  }

  private sendHeaders(): Record<string, string> {
    return this.headers({
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': this.botToken,
    });
  }

  async getQrCode(
    uri?: string,
    size?: number,
    start?: string,
  ): Promise<ViberQrCode> {
    const url = this.qrUrl(uri, size, start, 'json');
    const res = await this.fetchViber(url);
    const body = (await res.json()) as ViberServiceEnvelope<{
      uri: string;
      bot_url: string;
      qr_image: string;
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw this.qrError(res.status, body.error);
    }

    return {
      uri: body.data.uri,
      botUrl: body.data.bot_url,
      qrImage: body.data.qr_image,
    };
  }

  async getQrPng(
    uri?: string,
    size?: number,
    start?: string,
  ): Promise<Buffer> {
    const res = await this.fetchViber(this.qrUrl(uri, size, start));
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as ViberServiceEnvelope<unknown>;
      throw this.qrError(res.status, body.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private qrError(status: number, error?: string): Error {
    const message = error ?? `viber-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    const res = await this.fetchViber(`${this.baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, text }),
    });

    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as ViberServiceEnvelope<unknown>;
      throw new ServiceUnavailableException(
        body.error ?? `viber-service returned HTTP ${res.status}`,
      );
    }
  }

  async sendBatchText(
    recipientIds: string[],
    text: string,
  ): Promise<{
    total: number;
    sent: number;
    failed: number;
    chunkCount: number;
    failedRecipientIds: string[];
  }> {
    const res = await this.fetchViber(`${this.baseUrl}/api/v1/messages/batch`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_ids: recipientIds, text }),
    });

    const body = (await res.json().catch(() => ({}))) as ViberServiceEnvelope<{
      total: number;
      sent: number;
      failed: number;
      chunk_count: number;
      failed_recipient_ids?: string[];
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw new ServiceUnavailableException(
        body.error ?? `viber-service returned HTTP ${res.status}`,
      );
    }

    return {
      total: body.data.total,
      sent: body.data.sent,
      failed: body.data.failed,
      chunkCount: body.data.chunk_count,
      failedRecipientIds: body.data.failed_recipient_ids ?? [],
    };
  }

  async startConnect(userId: string): Promise<ViberConnectStartResponse> {
    const existing = await this.connections.findByUserId(userId);

    if (existing) {
      const qr = await this.getQrCodeSafe(280);
      return {
        connected: true,
        viberUserId: existing.viberUserId,
        connectedAt: existing.connectedAt.toISOString(),
        uri: qr.uri,
        botUrl: qr.botUrl,
        qrImage: qr.qrImage,
      };
    }

    const pending = await this.connectCodes.peekForUser(userId);
    const issued = pending ?? (await this.connectCodes.issue(userId));
    // Embed CONNECT code in deep-link / QR context when viber-service supports start.
    const qr = await this.getQrCodeSafe(280, `CONNECT ${issued.code}`);

    return {
      connected: false,
      code: issued.code,
      expiresInSeconds: issued.expiresInSeconds,
      connectMessage: `CONNECT ${issued.code}`,
      uri: qr.uri,
      botUrl: qr.botUrl,
      qrImage: qr.qrImage,
    };
  }

  private async getQrCodeSafe(
    size: number,
    start?: string,
  ): Promise<ViberQrCode> {
    try {
      return await this.getQrCode(undefined, size, start);
    } catch (err) {
      this.logger.warn(
        `QR via viber-service failed, using bot URL fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const uri = this.uri;
      const name = uri.replace(/^@/, '');
      return {
        uri,
        botUrl: `viber://pa?chatURI=${encodeURIComponent(name)}`,
        qrImage: '',
      };
    }
  }

  async getConnectStatus(
    userId: string,
  ): Promise<ViberConnectStatusResponse> {
    const existing = await this.connections.findByUserId(userId);
    if (existing) {
      return {
        connected: true,
        viberUserId: existing.viberUserId,
        connectedAt: existing.connectedAt.toISOString(),
      };
    }

    const pending = await this.connectCodes.peekForUser(userId);
    if (!pending) {
      return { connected: false };
    }

    return {
      connected: false,
      pendingCode: pending.code,
      expiresInSeconds: pending.expiresInSeconds,
      connectMessage: `CONNECT ${pending.code}`,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await this.connections.disconnectByUserId(userId);
  }

  /**
   * Verify Viber HMAC-SHA256 content signature (X-Viber-Content-Signature).
   * Expected = hex(HMAC-SHA256(auth_token, rawBody)).
   */
  verifyDirectWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer,
  ): void {
    const expected = createHmac('sha256', this.botToken)
      .update(rawBody)
      .digest('hex')
      .toLowerCase();
    const got = Buffer.from((signatureHeader ?? '').trim().toLowerCase());
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('Invalid Viber webhook signature');
    }
  }

  /** Register (or replace) the public account webhook with Viber. */
  async setWebhook(url: string): Promise<void> {
    const res = await fetch('https://chatapi.viber.com/pa/set_webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': this.botToken,
      },
      body: JSON.stringify({
        url,
        event_types: [
          'subscribed',
          'unsubscribed',
          'conversation_started',
          'message',
        ],
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      status?: number;
      status_message?: string;
    };
    if (!res.ok || (json.status != null && json.status !== 0)) {
      throw new ServiceUnavailableException(
        json.status_message ?? `Viber set_webhook failed (${res.status})`,
      );
    }
  }

  /**
   * Parse a raw Viber callback into our normalized event shape.
   */
  parseDirectWebhookEvents(rawBody: Buffer): ViberInboundEvent[] {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Viber webhook JSON');
    }
    return this.parseUpdate(payload);
  }

  parseUpdate(payload: unknown): ViberInboundEvent[] {
    const update = payload as {
      event?: string;
      user?: { id?: string };
      user_id?: string;
      sender?: { id?: string };
      context?: string;
      message?: { text?: string; type?: string };
      message_token?: number | string;
    };

    const event = String(update.event ?? '')
      .trim()
      .toLowerCase();

    // set_webhook handshake — acknowledge with empty events
    if (!event || event === 'webhook') {
      return [];
    }

    const out: ViberInboundEvent[] = [];

    if (event === 'subscribed' || event === 'conversation_started') {
      const userId = String(
        update.sender?.id ?? update.user?.id ?? '',
      ).trim();
      if (userId) {
        out.push({ type: VIBER_EVENT_FOLLOW, user_id: userId });
        const context =
          typeof update.context === 'string' ? update.context.trim() : '';
        if (context) {
          out.push({
            type: VIBER_EVENT_MESSAGE,
            user_id: userId,
            text: context,
          });
        }
      }
      return out;
    }

    if (event === 'unsubscribed') {
      const userId = String(
        update.user_id ?? update.user?.id ?? update.sender?.id ?? '',
      ).trim();
      if (userId) {
        out.push({ type: VIBER_EVENT_UNFOLLOW, user_id: userId });
      }
      return out;
    }

    if (event === 'message') {
      const userId = String(update.sender?.id ?? '').trim();
      const text =
        typeof update.message?.text === 'string'
          ? update.message.text.trim()
          : '';
      if (userId && text) {
        out.push({
          type: VIBER_EVENT_MESSAGE,
          user_id: userId,
          ...(update.message_token != null
            ? { message_id: String(update.message_token) }
            : {}),
          text,
        });
      }
      return out;
    }

    return out;
  }

  async handleEvents(events: ViberInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (!event.user_id) continue;

      if (event.type === VIBER_EVENT_FOLLOW) {
        await this.handleFollow(event.user_id);
        continue;
      }

      if (event.type === VIBER_EVENT_UNFOLLOW) {
        await this.handleUnfollow(event.user_id);
        continue;
      }

      if (event.type === VIBER_EVENT_MESSAGE && event.text) {
        await this.handleMessage(event.user_id, event.text);
      }
    }
  }

  private async handleFollow(viberUserId: string): Promise<void> {
    try {
      await this.sendText(viberUserId, this.welcomeMessage);
      this.logger.log(`Sent welcome message to Viber user ${viberUserId}`);
    } catch (err) {
      this.logger.error(
        `Failed to welcome Viber user ${viberUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleUnfollow(viberUserId: string): Promise<void> {
    const linked = await this.connections.findByViberUserId(viberUserId);
    if (!linked) return;
    try {
      await this.connections.disconnectByViberUserId(viberUserId);
      this.logger.log(
        `Disconnected Viber user ${viberUserId} from local user ${linked.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to disconnect on unfollow ${viberUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleMessage(
    viberUserId: string,
    text: string,
  ): Promise<void> {
    const match = CONNECT_CODE_RE.exec(text);
    if (!match) return;

    const code = match[1] ?? '';
    try {
      await this.linkWithConnectCode(viberUserId, code);
    } catch (err) {
      const message =
        err instanceof ConflictException || err instanceof BadRequestException
          ? err.message
          : 'Could not link your account. Please try again from Mosonic settings.';
      try {
        await this.sendText(viberUserId, message);
      } catch (sendErr) {
        this.logger.error(
          `Failed to reply after connect error: ${
            sendErr instanceof Error ? sendErr.message : String(sendErr)
          }`,
        );
      }
      if (
        !(err instanceof ConflictException) &&
        !(err instanceof BadRequestException)
      ) {
        this.logger.error(
          `CONNECT link failed for ${viberUserId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async linkWithConnectCode(
    viberUserId: string,
    code: string,
  ): Promise<void> {
    const localUserId = await this.connectCodes.consume(code);
    if (!localUserId) {
      throw new BadRequestException(
        'Invalid or expired CONNECT code. Open Mosonic settings and generate a new one.',
      );
    }

    const alreadyLinked =
      await this.connections.findByViberUserId(viberUserId);
    if (alreadyLinked && alreadyLinked.userId !== localUserId) {
      throw new ConflictException(
        'This Viber account is already linked to another Mosonic user.',
      );
    }

    await this.connections.upsert(localUserId, viberUserId);
    await this.sendText(
      viberUserId,
      'Connected successfully! Your Mosonic account is now linked to Viber.',
    );
    this.logger.log(
      `Linked Viber user ${viberUserId} to local user ${localUserId}`,
    );
  }

  private qrUrl(
    uri?: string,
    size?: number,
    start?: string,
    format?: 'json',
  ): string {
    const params = new URLSearchParams({
      uri: uri?.trim() || this.uri,
    });
    if (size) params.set('size', String(size));
    if (start?.trim()) params.set('start', start.trim());
    if (format) params.set('format', format);
    return `${this.baseUrl}/api/v1/qr?${params.toString()}`;
  }

  private async fetchViber(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, { headers: this.headers(), ...init });
    } catch (err) {
      this.logger.error(
        `viber-service unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException('viber-service is unreachable');
    }
  }
}
