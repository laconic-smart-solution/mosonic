import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { TelegramConnectCodeService } from './telegram-connect-code.service';
import { TelegramConnectionService } from './telegram-connection.service';
import {
  TELEGRAM_EVENT_FOLLOW,
  TELEGRAM_EVENT_MESSAGE,
  TELEGRAM_EVENT_UNFOLLOW,
  type TelegramInboundEvent,
  type TelegramQrCode,
} from './telegram.types';

type TelegramServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for starting the bot! Send CONNECT <code> from Mosonic settings to link your account.';

const CONNECT_CODE_RE = /^\s*CONNECT\s+([A-Za-z0-9]{4,12})\s*$/i;

export type TelegramConnectStartResponse = {
  connected: boolean;
  code?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
  telegramChatId?: string;
  connectedAt?: string;
  botUsername: string;
  botUrl: string;
  qrImage: string;
};

export type TelegramConnectStatusResponse = {
  connected: boolean;
  telegramChatId?: string;
  connectedAt?: string;
  pendingCode?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectCodes: TelegramConnectCodeService,
    private readonly connections: TelegramConnectionService,
  ) {}

  private get botToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'TELEGRAM_BOT_TOKEN is not configured',
      );
    }
    return token;
  }

  private get webhookSecret(): string {
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'TELEGRAM_WEBHOOK_SECRET is not configured',
      );
    }
    return secret;
  }

  /** Base URL of telegram-service, either direct (:8087) or through the comms gateway. */
  private get baseUrl(): string {
    return (
      this.config
        .get<string>('TELEGRAM_SERVICE_URL')
        ?.trim()
        .replace(/\/$/, '') ?? 'http://localhost:8087'
    );
  }

  get botUsername(): string {
    const raw =
      this.config.get<string>('TELEGRAM_BOT_USERNAME')?.trim() || 'MosonicBot';
    return raw.startsWith('@') ? raw : `@${raw}`;
  }

  private get welcomeMessage(): string {
    return (
      this.config.get<string>('TELEGRAM_WELCOME_MESSAGE')?.trim() ||
      DEFAULT_WELCOME
    );
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Gateway-Secret':
        this.config.get<string>('COMMUNICATION_GATEWAY_SECRET')?.trim() ?? '',
      'X-Tenant-ID':
        this.config.get<string>('TELEGRAM_TENANT_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000001',
      'X-Actor-ID':
        this.config.get<string>('TELEGRAM_ACTOR_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000002',
      ...extra,
    };
  }

  private sendHeaders(): Record<string, string> {
    return this.headers({
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Token': this.botToken,
    });
  }

  async getQrCode(
    botUsername?: string,
    size?: number,
    start?: string,
  ): Promise<TelegramQrCode> {
    const url = this.qrUrl(botUsername, size, start, 'json');
    const res = await this.fetchTelegram(url);
    const body = (await res.json()) as TelegramServiceEnvelope<{
      bot_username: string;
      bot_url: string;
      qr_image: string;
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw this.qrError(res.status, body.error);
    }

    return {
      botUsername: body.data.bot_username,
      botUrl: body.data.bot_url,
      qrImage: body.data.qr_image,
    };
  }

  async getQrPng(
    botUsername?: string,
    size?: number,
    start?: string,
  ): Promise<Buffer> {
    const res = await this.fetchTelegram(
      this.qrUrl(botUsername, size, start),
    );
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as TelegramServiceEnvelope<unknown>;
      throw this.qrError(res.status, body.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private qrError(status: number, error?: string): Error {
    const message = error ?? `telegram-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    const res = await this.fetchTelegram(`${this.baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, text }),
    });

    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as TelegramServiceEnvelope<unknown>;
      throw new ServiceUnavailableException(
        body.error ?? `telegram-service returned HTTP ${res.status}`,
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
    const res = await this.fetchTelegram(
      `${this.baseUrl}/api/v1/messages/batch`,
      {
        method: 'POST',
        headers: this.sendHeaders(),
        body: JSON.stringify({ recipient_ids: recipientIds, text }),
      },
    );

    const body = (await res.json().catch(() => ({}))) as TelegramServiceEnvelope<{
      total: number;
      sent: number;
      failed: number;
      chunk_count: number;
      failed_recipient_ids?: string[];
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw new ServiceUnavailableException(
        body.error ?? `telegram-service returned HTTP ${res.status}`,
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

  async startConnect(userId: string): Promise<TelegramConnectStartResponse> {
    const existing = await this.connections.findByUserId(userId);
    const qr = await this.getQrCodeSafe(280);

    if (existing) {
      return {
        connected: true,
        telegramChatId: existing.telegramChatId,
        connectedAt: existing.connectedAt.toISOString(),
        botUsername: qr.botUsername,
        botUrl: qr.botUrl,
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
      botUsername: qr.botUsername,
      botUrl: qr.botUrl,
      qrImage: qr.qrImage,
    };
  }

  private async getQrCodeSafe(size: number): Promise<TelegramQrCode> {
    try {
      return await this.getQrCode(undefined, size);
    } catch (err) {
      this.logger.warn(
        `QR via telegram-service failed, using bot URL fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const botUsername = this.botUsername;
      const name = botUsername.replace(/^@/, '');
      return {
        botUsername,
        botUrl: `https://t.me/${name}`,
        qrImage: '',
      };
    }
  }

  async getConnectStatus(
    userId: string,
  ): Promise<TelegramConnectStatusResponse> {
    const existing = await this.connections.findByUserId(userId);
    if (existing) {
      return {
        connected: true,
        telegramChatId: existing.telegramChatId,
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
   * Verify Telegram secret token header against TELEGRAM_WEBHOOK_SECRET.
   * Header: X-Telegram-Bot-Api-Secret-Token
   */
  verifyDirectWebhookSecret(secretHeader: string | undefined): void {
    const got = Buffer.from(secretHeader?.trim() ?? '');
    const want = Buffer.from(this.webhookSecret);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('Invalid Telegram webhook secret token');
    }
  }

  /** Telegram Bot API helper (used for polling / setWebhook). */
  async callBotApi<T = unknown>(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!res.ok || !json.ok) {
      throw new ServiceUnavailableException(
        json.description ?? `Telegram Bot API ${method} failed (${res.status})`,
      );
    }
    return json.result as T;
  }

  async deleteWebhook(): Promise<void> {
    await this.callBotApi('deleteWebhook', { drop_pending_updates: false });
  }

  async setWebhook(url: string): Promise<void> {
    await this.callBotApi('setWebhook', {
      url,
      secret_token: this.webhookSecret,
      allowed_updates: ['message', 'my_chat_member'],
    });
  }

  async getUpdates(offset: number, timeoutSec = 25): Promise<
    Array<{ update_id: number } & Record<string, unknown>>
  > {
    return this.callBotApi('getUpdates', {
      offset,
      timeout: timeoutSec,
      allowed_updates: ['message', 'my_chat_member'],
    });
  }

  /**
   * Parse a raw Telegram Update into our normalized callback shape.
   */
  parseDirectWebhookEvents(rawBody: Buffer): TelegramInboundEvent[] {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Telegram webhook JSON');
    }
    return this.parseUpdate(payload);
  }

  parseUpdate(payload: unknown): TelegramInboundEvent[] {
    const update = payload as {
      message?: {
        message_id?: number;
        from?: { id?: number };
        chat?: { id?: number };
        text?: string;
      };
      my_chat_member?: {
        from?: { id?: number };
        chat?: { id?: number };
        new_chat_member?: { status?: string };
      };
    };

    const out: TelegramInboundEvent[] = [];

    const member = update.my_chat_member;
    if (member) {
      const userId = String(member.from?.id ?? member.chat?.id ?? '').trim();
      const status = String(member.new_chat_member?.status ?? '')
        .trim()
        .toLowerCase();
      if (userId) {
        if (
          status === 'member' ||
          status === 'administrator' ||
          status === 'restricted'
        ) {
          out.push({ type: TELEGRAM_EVENT_FOLLOW, user_id: userId });
        } else if (status === 'left' || status === 'kicked') {
          out.push({ type: TELEGRAM_EVENT_UNFOLLOW, user_id: userId });
        }
      }
    }

    const message = update.message;
    if (message) {
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (text) {
        const userId = String(
          message.from?.id ?? message.chat?.id ?? '',
        ).trim();
        if (userId) {
          if (text.startsWith('/start')) {
            out.push({ type: TELEGRAM_EVENT_FOLLOW, user_id: userId });
          }
          out.push({
            type: TELEGRAM_EVENT_MESSAGE,
            user_id: userId,
            ...(message.message_id != null
              ? { message_id: String(message.message_id) }
              : {}),
            text,
          });
        }
      }
    }

    return out;
  }

  async handleEvents(events: TelegramInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (!event.user_id) continue;

      if (event.type === TELEGRAM_EVENT_FOLLOW) {
        await this.handleFollow(event.user_id);
        continue;
      }

      if (event.type === TELEGRAM_EVENT_UNFOLLOW) {
        await this.handleUnfollow(event.user_id);
        continue;
      }

      if (event.type === TELEGRAM_EVENT_MESSAGE && event.text) {
        await this.handleMessage(event.user_id, event.text);
      }
    }
  }

  private async handleFollow(telegramChatId: string): Promise<void> {
    try {
      await this.sendText(telegramChatId, this.welcomeMessage);
      this.logger.log(`Sent welcome message to Telegram chat ${telegramChatId}`);
    } catch (err) {
      this.logger.error(
        `Failed to welcome Telegram chat ${telegramChatId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleUnfollow(telegramChatId: string): Promise<void> {
    const linked = await this.connections.findByTelegramChatId(telegramChatId);
    if (!linked) return;
    try {
      await this.connections.disconnectByTelegramChatId(telegramChatId);
      this.logger.log(
        `Disconnected Telegram chat ${telegramChatId} from local user ${linked.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to disconnect on unfollow ${telegramChatId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleMessage(
    telegramChatId: string,
    text: string,
  ): Promise<void> {
    const match = CONNECT_CODE_RE.exec(text);
    if (!match) return;

    const code = match[1] ?? '';
    try {
      await this.linkWithConnectCode(telegramChatId, code);
    } catch (err) {
      const message =
        err instanceof ConflictException || err instanceof BadRequestException
          ? err.message
          : 'Could not link your account. Please try again from Mosonic settings.';
      try {
        await this.sendText(telegramChatId, message);
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
          `CONNECT link failed for ${telegramChatId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async linkWithConnectCode(
    telegramChatId: string,
    code: string,
  ): Promise<void> {
    const localUserId = await this.connectCodes.consume(code);
    if (!localUserId) {
      throw new BadRequestException(
        'Invalid or expired CONNECT code. Open Mosonic settings and generate a new one.',
      );
    }

    const alreadyLinked =
      await this.connections.findByTelegramChatId(telegramChatId);
    if (alreadyLinked && alreadyLinked.userId !== localUserId) {
      throw new ConflictException(
        'This Telegram account is already linked to another Mosonic user.',
      );
    }

    await this.connections.upsert(localUserId, telegramChatId);
    await this.sendText(
      telegramChatId,
      'Connected successfully! Your Mosonic account is now linked to Telegram.',
    );
    this.logger.log(
      `Linked Telegram chat ${telegramChatId} to local user ${localUserId}`,
    );
  }

  private qrUrl(
    botUsername?: string,
    size?: number,
    start?: string,
    format?: 'json',
  ): string {
    const params = new URLSearchParams({
      bot_username: botUsername?.trim() || this.botUsername,
    });
    if (size) params.set('size', String(size));
    if (start?.trim()) params.set('start', start.trim());
    if (format) params.set('format', format);
    return `${this.baseUrl}/api/v1/qr?${params.toString()}`;
  }

  private async fetchTelegram(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, { headers: this.headers(), ...init });
    } catch (err) {
      this.logger.error(
        `telegram-service unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException('telegram-service is unreachable');
    }
  }
}
