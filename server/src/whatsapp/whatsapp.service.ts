import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ZernioRestClient } from '../mcp/zernio/zernio-rest.client';
import { UsersService } from '../users/users.service';
import { WhatsAppConnectCodeService } from './whatsapp-connect-code.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import {
  WHATSAPP_EVENT_FOLLOW,
  WHATSAPP_EVENT_MESSAGE,
  WHATSAPP_EVENT_UNFOLLOW,
  type WhatsAppInboundEvent,
  type WhatsAppQrCode,
} from './whatsapp.types';

type WhatsAppServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for messaging us! Send CONNECT <code> from Mosonic settings to link your account.';

const CONNECT_CODE_RE = /^\s*CONNECT\s+([A-Za-z0-9]{4,12})\s*$/i;

const PHONE_DIGITS_RE = /^\d{8,15}$/;

export type WhatsAppConnectStartResponse = {
  connected: boolean;
  code?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
  whatsappWaId?: string;
  connectedAt?: string;
  phone: string;
  chatUrl: string;
  qrImage: string;
};

export type WhatsAppConnectStatusResponse = {
  connected: boolean;
  whatsappWaId?: string;
  connectedAt?: string;
  pendingCode?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly connectCodes: WhatsAppConnectCodeService,
    private readonly connections: WhatsAppConnectionService,
    private readonly users: UsersService,
    private readonly zernioRest: ZernioRestClient,
  ) {}

  /** true (default) = Go whatsapp-service; false = Zernio inbox API. */
  private get useGolang(): boolean {
    const raw = this.config
      .get<string>('WHATSAPP_USE_GOLANG')
      ?.trim()
      .toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return true;
  }

  /** true = send directly via Meta Graph API (no Go service or Zernio required). */
  private get useMetaDirect(): boolean {
    const raw = this.config
      .get<string>('WHATSAPP_USE_META_DIRECT')
      ?.trim()
      .toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private get accessToken(): string {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'WHATSAPP_ACCESS_TOKEN is not configured',
      );
    }
    return token;
  }

  private get phoneNumberId(): string {
    const id = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
    if (!id) {
      throw new ServiceUnavailableException(
        'WHATSAPP_PHONE_NUMBER_ID is not configured',
      );
    }
    return id;
  }

  private get appSecret(): string {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'WHATSAPP_APP_SECRET is not configured',
      );
    }
    return secret;
  }

  get verifyToken(): string {
    return this.config.get<string>('WHATSAPP_VERIFY_TOKEN')?.trim() ?? '';
  }

  /** Base URL of whatsapp-service, either direct (:8089) or through the comms gateway. */
  private get baseUrl(): string {
    return (
      this.config
        .get<string>('WHATSAPP_SERVICE_URL')
        ?.trim()
        .replace(/\/$/, '') ?? 'http://localhost:8089'
    );
  }

  /** Business phone for wa.me QR — E.164 digits, no +. */
  get businessPhone(): string {
    return (
      this.config
        .get<string>('WHATSAPP_BUSINESS_PHONE')
        ?.trim()
        .replace(/^\+/, '') || ''
    );
  }

  private get welcomeMessage(): string {
    return (
      this.config.get<string>('WHATSAPP_WELCOME_MESSAGE')?.trim() ||
      DEFAULT_WELCOME
    );
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Gateway-Secret':
        this.config.get<string>('COMMUNICATION_GATEWAY_SECRET')?.trim() ?? '',
      'X-Tenant-ID':
        this.config.get<string>('WHATSAPP_TENANT_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000001',
      'X-Actor-ID':
        this.config.get<string>('WHATSAPP_ACTOR_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000002',
      ...extra,
    };
  }

  private sendHeaders(): Record<string, string> {
    return this.headers({
      'Content-Type': 'application/json',
      'X-WhatsApp-Access-Token': this.accessToken,
      'X-WhatsApp-Phone-Number-Id': this.phoneNumberId,
    });
  }

  async getQrCode(
    phone?: string,
    size?: number,
    text?: string,
  ): Promise<WhatsAppQrCode> {
    const url = this.qrUrl(phone, size, text, 'json');
    const res = await this.fetchWhatsApp(url);
    const body = (await res.json()) as WhatsAppServiceEnvelope<{
      phone: string;
      chat_url: string;
      qr_image: string;
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw this.qrError(res.status, body.error);
    }

    return {
      phone: body.data.phone,
      chatUrl: body.data.chat_url,
      qrImage: body.data.qr_image,
    };
  }

  async getQrPng(
    phone?: string,
    size?: number,
    text?: string,
  ): Promise<Buffer> {
    const res = await this.fetchWhatsApp(this.qrUrl(phone, size, text));
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as WhatsAppServiceEnvelope<unknown>;
      throw this.qrError(res.status, body.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private qrError(status: number, error?: string): Error {
    const message = error ?? `whatsapp-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  /**
   * Outbound text. When WHATSAPP_USE_GOLANG=false, requires userId to resolve the
   * sender's Zernio WhatsApp accountId.
   */
  async sendText(
    recipientId: string,
    text: string,
    userId?: string,
  ): Promise<void> {
    // Priority 1: direct Meta Graph API
    if (this.useMetaDirect) {
      await this.sendTextViaMeta(recipientId, text);
      return;
    }

    // Priority 2: Zernio inbox API
    if (!this.useGolang) {
      await this.sendTextViaZernio(recipientId, text, userId);
      return;
    }

    // Priority 3: Go whatsapp-service
    const res = await this.fetchWhatsApp(`${this.baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: this.sendHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, text }),
    });

    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as WhatsAppServiceEnvelope<unknown>;
      throw new ServiceUnavailableException(
        body.error ?? `whatsapp-service returned HTTP ${res.status}`,
      );
    }
  }

  /**
   * Send a text message directly via Meta Cloud API (Graph API v18.0).
   * Requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
   */
  private async sendTextViaMeta(
    recipientId: string,
    text: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientId,
          type: 'text',
          text: { body: text },
        }),
      });
    } catch (err) {
      throw new ServiceUnavailableException(
        `Meta Graph API unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new ServiceUnavailableException(
        body?.error?.message ?? `Meta Graph API returned HTTP ${res.status}`,
      );
    }
  }

  private async sendTextViaZernio(
    recipientId: string,
    text: string,
    userId?: string,
  ): Promise<void> {
    const id = userId?.trim();
    if (!id) {
      throw new ServiceUnavailableException(
        'WhatsApp Zernio send requires userId (set WHATSAPP_USE_GOLANG=true for Meta/Go sends without a Mosonic user)',
      );
    }
    const accounts = await this.users.getAllActiveConnectedAccounts(id);
    const wa = accounts.find(
      (a) => a.channel.trim().toLowerCase() === 'whatsapp',
    );
    const accountId = wa?.accountId?.trim();
    if (!accountId) {
      throw new ServiceUnavailableException(
        'No Zernio WhatsApp account connected for this user',
      );
    }
    try {
      await this.zernioRest.sendWhatsAppInboxText({
        accountId,
        participantId: recipientId,
        message: text,
        templateName:
          this.config.get<string>('WHATSAPP_ZERNIO_TEMPLATE_NAME')?.trim() ||
          undefined,
        templateLanguage:
          this.config
            .get<string>('WHATSAPP_ZERNIO_TEMPLATE_LANGUAGE')
            ?.trim() || 'en',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        message || 'Zernio WhatsApp send failed',
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
    const res = await this.fetchWhatsApp(
      `${this.baseUrl}/api/v1/messages/batch`,
      {
        method: 'POST',
        headers: this.sendHeaders(),
        body: JSON.stringify({ recipient_ids: recipientIds, text }),
      },
    );

    const body = (await res
      .json()
      .catch(() => ({}))) as WhatsAppServiceEnvelope<{
      total: number;
      sent: number;
      failed: number;
      chunk_count: number;
      failed_recipient_ids?: string[];
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw new ServiceUnavailableException(
        body.error ?? `whatsapp-service returned HTTP ${res.status}`,
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

  async startConnect(userId: string): Promise<WhatsAppConnectStartResponse> {
    const existing = await this.connections.findByUserId(userId);

    if (existing) {
      const qr = await this.getQrCodeSafe(280);
      return {
        connected: true,
        whatsappWaId: existing.whatsappWaId,
        connectedAt: existing.connectedAt.toISOString(),
        phone: qr.phone,
        chatUrl: qr.chatUrl,
        qrImage: qr.qrImage,
      };
    }

    const pending = await this.connectCodes.peekForUser(userId);
    const issued = pending ?? (await this.connectCodes.issue(userId));
    const connectMessage = `CONNECT ${issued.code}`;
    const qr = await this.getQrCodeSafe(280, connectMessage);

    return {
      connected: false,
      code: issued.code,
      expiresInSeconds: issued.expiresInSeconds,
      connectMessage,
      phone: qr.phone,
      chatUrl: qr.chatUrl,
      qrImage: qr.qrImage,
    };
  }

  private async getQrCodeSafe(
    size: number,
    text?: string,
  ): Promise<WhatsAppQrCode> {
    try {
      return await this.getQrCode(undefined, size, text);
    } catch (err) {
      this.logger.warn(
        `QR via whatsapp-service failed, using wa.me fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const phone = this.businessPhone;
      const chatUrl = phone
        ? `https://wa.me/${phone}${
            text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''
          }`
        : '';
      return {
        phone,
        chatUrl,
        qrImage: '',
      };
    }
  }

  async getConnectStatus(
    userId: string,
  ): Promise<WhatsAppConnectStatusResponse> {
    const existing = await this.connections.findByUserId(userId);
    if (existing) {
      return {
        connected: true,
        whatsappWaId: existing.whatsappWaId,
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
   * Verify Meta Cloud API HMAC-SHA256 signature (X-Hub-Signature-256).
   * Header format: sha256=<hex>; expected = HMAC-SHA256(app_secret, rawBody).
   */
  verifyDirectWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: Buffer,
  ): void {
    const gotRaw = (signatureHeader ?? '').trim().toLowerCase();
    const gotHex = gotRaw.startsWith('sha256=')
      ? gotRaw.slice('sha256='.length)
      : gotRaw;
    const expected = createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex')
      .toLowerCase();
    const got = Buffer.from(gotHex);
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('Invalid WhatsApp webhook signature');
    }
  }

  /** Meta hub.verify_token handshake — returns challenge when tokens match. */
  verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    if (String(mode ?? '').trim() !== 'subscribe') {
      throw new BadRequestException('hub.mode must be subscribe');
    }
    const expected = this.verifyToken;
    if (!expected) {
      throw new ServiceUnavailableException(
        'WHATSAPP_VERIFY_TOKEN is not configured',
      );
    }
    const got = Buffer.from(String(token ?? '').trim());
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('hub.verify_token mismatch');
    }
    const c = String(challenge ?? '').trim();
    if (!c) {
      throw new BadRequestException('hub.challenge is required');
    }
    return c;
  }

  /**
   * Parse a raw Meta Cloud API webhook into our normalized event shape.
   */
  parseDirectWebhookEvents(rawBody: Buffer): WhatsAppInboundEvent[] {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid WhatsApp webhook JSON');
    }
    return this.parseUpdate(payload);
  }

  parseUpdate(payload: unknown): WhatsAppInboundEvent[] {
    // Forwarded shape from whatsapp-service: { events: [...] }
    if (
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { events?: unknown }).events)
    ) {
      return ((payload as { events: WhatsAppInboundEvent[] }).events ?? [])
        .filter((e) => e && typeof e.user_id === 'string' && e.user_id.trim())
        .map((e) => ({
          type: String(e.type ?? '').trim(),
          user_id: this.normalizePhone(e.user_id),
          ...(e.message_id ? { message_id: String(e.message_id) } : {}),
          ...(e.text ? { text: String(e.text).trim() } : {}),
        }))
        .filter((e) => e.user_id && e.type);
    }

    const update = payload as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          field?: string;
          value?: {
            messages?: Array<{
              from?: string;
              id?: string;
              type?: string;
              text?: { body?: string };
            }>;
            contacts?: Array<{ wa_id?: string }>;
          };
        }>;
      }>;
    };

    const out: WhatsAppInboundEvent[] = [];

    for (const entry of update.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field && change.field !== 'messages') continue;

        for (const msg of change.value?.messages ?? []) {
          const from = this.normalizePhone(
            msg.from ?? change.value?.contacts?.[0]?.wa_id ?? '',
          );
          if (!from) continue;

          const text =
            typeof msg.text?.body === 'string' ? msg.text.body.trim() : '';
          if (!text) continue;

          // First inbound message acts as "follow" for connect UX (mirrors whatsapp-service).
          out.push({ type: WHATSAPP_EVENT_FOLLOW, user_id: from });
          out.push({
            type: WHATSAPP_EVENT_MESSAGE,
            user_id: from,
            ...(msg.id ? { message_id: String(msg.id) } : {}),
            text,
          });
        }
      }
    }

    return out;
  }

  async handleEvents(events: WhatsAppInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (!event.user_id) continue;
      const waId = this.normalizePhone(event.user_id);
      if (!waId) continue;

      if (event.type === WHATSAPP_EVENT_FOLLOW) {
        await this.handleFollow(waId);
        continue;
      }

      if (event.type === WHATSAPP_EVENT_UNFOLLOW) {
        await this.handleUnfollow(waId);
        continue;
      }

      if (event.type === WHATSAPP_EVENT_MESSAGE && event.text) {
        await this.handleMessage(waId, event.text);
      }
    }
  }

  private normalizePhone(raw: string): string {
    const digits = String(raw ?? '')
      .trim()
      .replace(/^\+/, '')
      .replace(/[\s-]/g, '');
    return PHONE_DIGITS_RE.test(digits) ? digits : '';
  }

  private async handleFollow(whatsappWaId: string): Promise<void> {
    // Skip welcome spam when already linked (Meta emits synthetic follow per message).
    const linked = await this.connections.findByWhatsappWaId(whatsappWaId);
    if (linked) return;

    try {
      await this.sendText(whatsappWaId, this.welcomeMessage);
      this.logger.log(`Sent welcome message to WhatsApp user ${whatsappWaId}`);
    } catch (err) {
      this.logger.error(
        `Failed to welcome WhatsApp user ${whatsappWaId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleUnfollow(whatsappWaId: string): Promise<void> {
    const linked = await this.connections.findByWhatsappWaId(whatsappWaId);
    if (!linked) return;
    try {
      await this.connections.disconnectByWhatsappWaId(whatsappWaId);
      this.logger.log(
        `Disconnected WhatsApp user ${whatsappWaId} from local user ${linked.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to disconnect on unfollow ${whatsappWaId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleMessage(
    whatsappWaId: string,
    text: string,
  ): Promise<void> {
    const match = CONNECT_CODE_RE.exec(text);
    if (!match) return;

    const code = match[1] ?? '';
    try {
      await this.linkWithConnectCode(whatsappWaId, code);
    } catch (err) {
      const message =
        err instanceof ConflictException || err instanceof BadRequestException
          ? err.message
          : 'Could not link your account. Please try again from Mosonic settings.';
      try {
        await this.sendText(whatsappWaId, message);
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
          `CONNECT link failed for ${whatsappWaId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async linkWithConnectCode(
    whatsappWaId: string,
    code: string,
  ): Promise<void> {
    const localUserId = await this.connectCodes.consume(code);
    if (!localUserId) {
      throw new BadRequestException(
        'Invalid or expired CONNECT code. Open Mosonic settings and generate a new one.',
      );
    }

    const alreadyLinked =
      await this.connections.findByWhatsappWaId(whatsappWaId);
    if (alreadyLinked && alreadyLinked.userId !== localUserId) {
      throw new ConflictException(
        'This WhatsApp account is already linked to another Mosonic user.',
      );
    }

    await this.connections.upsert(localUserId, whatsappWaId);
    await this.sendText(
      whatsappWaId,
      'Connected successfully! Your Mosonic account is now linked to WhatsApp.',
      localUserId,
    );
    this.logger.log(
      `Linked WhatsApp user ${whatsappWaId} to local user ${localUserId}`,
    );
  }

  private qrUrl(
    phone?: string,
    size?: number,
    text?: string,
    format?: 'json',
  ): string {
    const params = new URLSearchParams({
      phone: phone?.trim() || this.businessPhone,
    });
    if (size) params.set('size', String(size));
    if (text?.trim()) params.set('text', text.trim());
    if (format) params.set('format', format);
    return `${this.baseUrl}/api/v1/qr?${params.toString()}`;
  }

  private async fetchWhatsApp(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, { headers: this.headers(), ...init });
    } catch (err) {
      this.logger.error(
        `whatsapp-service unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException('whatsapp-service is unreachable');
    }
  }
}
