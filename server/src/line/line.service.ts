import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { LineConnectCodeService } from './line-connect-code.service';
import { LineConnectionService } from './line-connection.service';
import {
  LINE_EVENT_FOLLOW,
  LINE_EVENT_MESSAGE,
  LINE_EVENT_UNFOLLOW,
  type LineInboundEvent,
  type LineQrCode,
} from './line.types';

type LineServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for adding us! Send CONNECT <code> from Mosonic settings to link your account.';

const CONNECT_CODE_RE = /^\s*CONNECT\s+([A-Za-z0-9]{4,12})\s*$/i;

export type LineConnectStartResponse = {
  connected: boolean;
  code?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
  lineUserId?: string;
  connectedAt?: string;
  basicId: string;
  addFriendUrl: string;
  qrImage: string;
};

export type LineConnectStatusResponse = {
  connected: boolean;
  lineUserId?: string;
  connectedAt?: string;
  pendingCode?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
};

@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectCodes: LineConnectCodeService,
    private readonly connections: LineConnectionService,
  ) {}

  private get channelSecret(): string {
    const secret = this.config.get<string>('LINE_CHANNEL_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'LINE_CHANNEL_SECRET is not configured',
      );
    }
    return secret;
  }

  private get channelAccessToken(): string {
    const token = this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'LINE_CHANNEL_ACCESS_TOKEN is not configured',
      );
    }
    return token;
  }

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
   * line-service is stateless: channel access token travels on every send.
   * QR rendering does not require this header.
   */
  private sendHeaders(): Record<string, string> {
    return this.headers({
      'Content-Type': 'application/json',
      'X-Line-Channel-Access-Token': this.channelAccessToken,
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

  private qrError(status: number, error?: string): Error {
    const message = error ?? `line-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  /** Push a text message via communication-service line-service proxy. */
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
   * Multicast a text message to many LINE users via line-service batch API.
   * line-service chunks recipients (500) and applies rate limiting.
   */
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
    const res = await this.fetchLine(`${this.baseUrl}/api/v1/messages/batch`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_ids: recipientIds, text }),
    });

    const body = (await res.json().catch(() => ({}))) as LineServiceEnvelope<{
      total: number;
      sent: number;
      failed: number;
      chunk_count: number;
      failed_recipient_ids?: string[];
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw new ServiceUnavailableException(
        body.error ?? `line-service returned HTTP ${res.status}`,
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

  async startConnect(userId: string): Promise<LineConnectStartResponse> {
    const existing = await this.connections.findByUserId(userId);
    const qr = await this.getQrCodeSafe(280);

    if (existing) {
      return {
        connected: true,
        lineUserId: existing.lineUserId,
        connectedAt: existing.connectedAt.toISOString(),
        basicId: qr.basicId,
        addFriendUrl: qr.addFriendUrl,
        qrImage: qr.qrImage,
      };
    }

    const pending = await this.connectCodes.peekForUser(userId);
    const issued = pending ?? (await this.connectCodes.issue(userId));

    return {
      connected: false,
      code: issued.code,
      expiresInSeconds: issued.expiresInSeconds,
      connectMessage: `CONNECT ${issued.code}`,
      basicId: qr.basicId,
      addFriendUrl: qr.addFriendUrl,
      qrImage: qr.qrImage,
    };
  }

  /** Prefer line-service QR; fall back to add-friend URL only if proxy is down. */
  private async getQrCodeSafe(size: number): Promise<LineQrCode> {
    try {
      return await this.getQrCode(undefined, size);
    } catch (err) {
      this.logger.warn(
        `QR via line-service failed, using add-friend URL fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const basicId = this.basicId;
      return {
        basicId,
        addFriendUrl: `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`,
        qrImage: '',
      };
    }
  }

  async getConnectStatus(userId: string): Promise<LineConnectStatusResponse> {
    const existing = await this.connections.findByUserId(userId);
    if (existing) {
      return {
        connected: true,
        lineUserId: existing.lineUserId,
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
   * Verify LINE webhook signature (`X-Line-Signature`) against raw body bytes.
   * LINE uses base64(HMAC_SHA256(rawBody, channelSecret)).
   */
  verifyDirectWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer,
  ): void {
    const signature = signatureHeader?.trim();
    if (!signature) {
      throw new BadRequestException('Missing x-line-signature header');
    }
    const expected = createHmac('sha256', this.channelSecret)
      .update(rawBody)
      .digest('base64');
    const got = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('Invalid LINE webhook signature');
    }
  }

  /**
   * Parse raw LINE webhook body into our normalized callback shape.
   * Keeps only events we currently support.
   */
  parseDirectWebhookEvents(rawBody: Buffer): LineInboundEvent[] {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid LINE webhook JSON');
    }
    const eventsRaw = (payload as { events?: unknown })?.events;
    if (!Array.isArray(eventsRaw)) return [];

    const out: LineInboundEvent[] = [];
    for (const item of eventsRaw) {
      if (!item || typeof item !== 'object') continue;
      const ev = item as Record<string, unknown>;
      const type = String(ev.type ?? '').trim().toLowerCase();
      const source = ev.source as Record<string, unknown> | undefined;
      const userId =
        typeof source?.userId === 'string' ? source.userId.trim() : '';
      const replyToken =
        typeof ev.replyToken === 'string' ? ev.replyToken.trim() : undefined;

      if (!type || !userId) continue;

      if (type === LINE_EVENT_FOLLOW || type === LINE_EVENT_UNFOLLOW) {
        out.push({
          type,
          user_id: userId,
          ...(replyToken ? { reply_token: replyToken } : {}),
        });
        continue;
      }

      if (type !== LINE_EVENT_MESSAGE) continue;
      const message = ev.message as Record<string, unknown> | undefined;
      const messageType = String(message?.type ?? '').trim().toLowerCase();
      if (messageType !== 'text') continue;
      const text = typeof message?.text === 'string' ? message.text : '';
      const messageId =
        typeof message?.id === 'string' ? message.id.trim() : undefined;
      out.push({
        type,
        user_id: userId,
        ...(replyToken ? { reply_token: replyToken } : {}),
        ...(messageId ? { message_id: messageId } : {}),
        ...(text ? { text } : {}),
      });
    }
    return out;
  }

  async handleEvents(events: LineInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (!event.user_id) continue;

      if (event.type === LINE_EVENT_FOLLOW) {
        await this.handleFollow(event.user_id);
        continue;
      }

      if (event.type === LINE_EVENT_UNFOLLOW) {
        await this.handleUnfollow(event.user_id);
        continue;
      }

      if (event.type === LINE_EVENT_MESSAGE && event.text) {
        await this.handleMessage(event.user_id, event.text);
      }
    }
  }

  private async handleFollow(lineUserId: string): Promise<void> {
    try {
      await this.sendText(lineUserId, this.welcomeMessage);
      this.logger.log(`Sent welcome message to LINE user ${lineUserId}`);
    } catch (err) {
      this.logger.error(
        `Failed to welcome LINE user ${lineUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleUnfollow(lineUserId: string): Promise<void> {
    const linked = await this.connections.findByLineUserId(lineUserId);
    if (!linked) return;
    try {
      await this.connections.disconnectByLineUserId(lineUserId);
      this.logger.log(
        `Disconnected LINE user ${lineUserId} from local user ${linked.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to disconnect on unfollow ${lineUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleMessage(lineUserId: string, text: string): Promise<void> {
    const match = CONNECT_CODE_RE.exec(text);
    if (!match) return;

    const code = match[1] ?? '';
    try {
      await this.linkWithConnectCode(lineUserId, code);
    } catch (err) {
      const message =
        err instanceof ConflictException || err instanceof BadRequestException
          ? err.message
          : 'Could not link your account. Please try again from Mosonic settings.';
      try {
        await this.sendText(lineUserId, message);
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
          `CONNECT link failed for ${lineUserId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async linkWithConnectCode(
    lineUserId: string,
    code: string,
  ): Promise<void> {
    const localUserId = await this.connectCodes.consume(code);
    if (!localUserId) {
      throw new BadRequestException(
        'Invalid or expired CONNECT code. Open Mosonic settings and generate a new one.',
      );
    }

    const alreadyLinked = await this.connections.findByLineUserId(lineUserId);
    if (alreadyLinked && alreadyLinked.userId !== localUserId) {
      throw new ConflictException(
        'This LINE account is already linked to another Mosonic user.',
      );
    }

    await this.connections.upsert(localUserId, lineUserId);
    await this.sendText(
      lineUserId,
      'Connected successfully! Your Mosonic account is now linked to LINE.',
    );
    this.logger.log(
      `Linked LINE user ${lineUserId} to local user ${localUserId}`,
    );
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
