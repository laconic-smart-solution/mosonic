import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { WechatConnectCodeService } from './wechat-connect-code.service';
import { WechatConnectionService } from './wechat-connection.service';
import {
  WECHAT_EVENT_FOLLOW,
  WECHAT_EVENT_MESSAGE,
  WECHAT_EVENT_SCAN,
  WECHAT_EVENT_UNFOLLOW,
  type WechatInboundEvent,
  type WechatQrCode,
} from './wechat.types';

type WechatServiceEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const DEFAULT_WELCOME =
  'Thanks for following! Send CONNECT <code> from Mosonic settings to link your account.';

const CONNECT_CODE_RE = /^\s*CONNECT\s+([A-Za-z0-9]{4,12})\s*$/i;
const BARE_CODE_RE = /^[A-Za-z0-9]{4,12}$/;

/** Refresh access_token this many seconds before WeChat's expires_in. */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 120_000;

export type WechatConnectStartResponse = {
  connected: boolean;
  code?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
  wechatOpenId?: string;
  connectedAt?: string;
  oaUsername: string;
  chatUrl: string;
  qrImage: string;
};

export type WechatConnectStatusResponse = {
  connected: boolean;
  wechatOpenId?: string;
  connectedAt?: string;
  pendingCode?: string;
  expiresInSeconds?: number;
  connectMessage?: string;
};

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  private cachedAccessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly connectCodes: WechatConnectCodeService,
    private readonly connections: WechatConnectionService,
  ) {}

  private get appId(): string {
    const id = this.config.get<string>('WECHAT_APP_ID')?.trim();
    if (!id) {
      throw new ServiceUnavailableException('WECHAT_APP_ID is not configured');
    }
    return id;
  }

  private get appSecret(): string {
    const secret = this.config.get<string>('WECHAT_APP_SECRET')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'WECHAT_APP_SECRET is not configured',
      );
    }
    return secret;
  }

  /** Token configured in WeChat OA for webhook signature verification. */
  private get oaToken(): string {
    const token = this.config.get<string>('WECHAT_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException('WECHAT_TOKEN is not configured');
    }
    return token;
  }

  /** Base URL of wechat-service, either direct (:8090) or through the comms gateway. */
  private get baseUrl(): string {
    return (
      this.config
        .get<string>('WECHAT_SERVICE_URL')
        ?.trim()
        .replace(/\/$/, '') ?? 'http://localhost:8090'
    );
  }

  get oaUsername(): string {
    return this.config.get<string>('WECHAT_OA_USERNAME')?.trim() || '';
  }

  private get welcomeMessage(): string {
    return (
      this.config.get<string>('WECHAT_WELCOME_MESSAGE')?.trim() ||
      DEFAULT_WELCOME
    );
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Gateway-Secret':
        this.config.get<string>('COMMUNICATION_GATEWAY_SECRET')?.trim() ?? '',
      'X-Tenant-ID':
        this.config.get<string>('WECHAT_TENANT_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000001',
      'X-Actor-ID':
        this.config.get<string>('WECHAT_ACTOR_ID')?.trim() ??
        '00000000-0000-0000-0000-000000000002',
      ...extra,
    };
  }

  private async sendHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.getAccessToken();
    return this.headers({
      'Content-Type': 'application/json',
      'X-WeChat-Access-Token': accessToken,
    });
  }

  /**
   * Fetch and cache WeChat client_credential access_token in memory.
   * https://api.weixin.qq.com/cgi-bin/token
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedAccessToken &&
      now < this.accessTokenExpiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS
    ) {
      return this.cachedAccessToken;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credential',
      appid: this.appId,
      secret: this.appSecret,
    });
    const url = `https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      this.logger.error(
        `WeChat token endpoint unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException(
        'WeChat access_token endpoint is unreachable',
      );
    }

    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    };

    if (!res.ok || !body.access_token) {
      throw new ServiceUnavailableException(
        body.errmsg
          ? `WeChat token error ${body.errcode ?? '?'}: ${body.errmsg}`
          : `WeChat token request failed (HTTP ${res.status})`,
      );
    }

    const expiresInSec =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in
        : 7200;
    this.cachedAccessToken = body.access_token;
    this.accessTokenExpiresAt = now + expiresInSec * 1000;
    return body.access_token;
  }

  /** Invalidate cached token (e.g. after WeChat returns invalid credential). */
  clearAccessTokenCache(): void {
    this.cachedAccessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async getQrCode(
    sceneStr?: string,
    oaUsername?: string,
    size?: number,
  ): Promise<WechatQrCode> {
    const url = await this.qrUrl(sceneStr, oaUsername, size, 'json');
    const res = await this.fetchWechat(url, {
      headers: await this.sendHeaders(),
    });
    const body = (await res.json()) as WechatServiceEnvelope<{
      scene_str?: string;
      chat_url: string;
      qr_image: string;
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw this.qrError(res.status, body.error);
    }

    return {
      sceneStr: body.data.scene_str ?? sceneStr?.trim() ?? '',
      chatUrl: body.data.chat_url,
      qrImage: body.data.qr_image,
    };
  }

  async getQrPng(
    sceneStr?: string,
    oaUsername?: string,
    size?: number,
  ): Promise<Buffer> {
    const res = await this.fetchWechat(
      await this.qrUrl(sceneStr, oaUsername, size),
      { headers: await this.sendHeaders() },
    );
    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as WechatServiceEnvelope<unknown>;
      throw this.qrError(res.status, body.error);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private qrError(status: number, error?: string): Error {
    const message = error ?? `wechat-service returned HTTP ${status}`;
    return status >= 400 && status < 500
      ? new BadRequestException(message)
      : new ServiceUnavailableException(message);
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    const res = await this.fetchWechat(`${this.baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: await this.sendHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, text }),
    });

    if (!res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as WechatServiceEnvelope<unknown>;
      throw new ServiceUnavailableException(
        body.error ?? `wechat-service returned HTTP ${res.status}`,
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
    const res = await this.fetchWechat(
      `${this.baseUrl}/api/v1/messages/batch`,
      {
        method: 'POST',
        headers: await this.sendHeaders(),
        body: JSON.stringify({ recipient_ids: recipientIds, text }),
      },
    );

    const body = (await res.json().catch(() => ({}))) as WechatServiceEnvelope<{
      total: number;
      sent: number;
      failed: number;
      chunk_count: number;
      failed_recipient_ids?: string[];
    }>;

    if (!res.ok || !body.success || !body.data) {
      throw new ServiceUnavailableException(
        body.error ?? `wechat-service returned HTTP ${res.status}`,
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

  async startConnect(userId: string): Promise<WechatConnectStartResponse> {
    const existing = await this.connections.findByUserId(userId);

    if (existing) {
      const qr = await this.getQrCodeSafe(undefined, 280);
      return {
        connected: true,
        wechatOpenId: existing.wechatOpenId,
        connectedAt: existing.connectedAt.toISOString(),
        oaUsername: this.oaUsername,
        chatUrl: qr.chatUrl,
        qrImage: qr.qrImage,
      };
    }

    const pending = await this.connectCodes.peekForUser(userId);
    const issued = pending ?? (await this.connectCodes.issue(userId));
    // Scene QR uses "CONNECT <code>" so scan/subscribe event_key can link automatically.
    const sceneStr = `CONNECT ${issued.code}`;
    const qr = await this.getQrCodeSafe(sceneStr, 280);

    return {
      connected: false,
      code: issued.code,
      expiresInSeconds: issued.expiresInSeconds,
      connectMessage: `CONNECT ${issued.code}`,
      oaUsername: this.oaUsername,
      chatUrl: qr.chatUrl,
      qrImage: qr.qrImage,
    };
  }

  private async getQrCodeSafe(
    sceneStr: string | undefined,
    size: number,
  ): Promise<WechatQrCode> {
    try {
      if (sceneStr) {
        return await this.getQrCode(sceneStr, undefined, size);
      }
      return await this.getQrCode(undefined, this.oaUsername || undefined, size);
    } catch (err) {
      this.logger.warn(
        `QR via wechat-service failed, using OA deep-link fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const name = this.oaUsername;
      return {
        sceneStr: sceneStr ?? '',
        chatUrl: name
          ? `weixin://dl/officialaccounts/?username=${encodeURIComponent(name)}`
          : '',
        qrImage: '',
      };
    }
  }

  async getConnectStatus(
    userId: string,
  ): Promise<WechatConnectStatusResponse> {
    const existing = await this.connections.findByUserId(userId);
    if (existing) {
      return {
        connected: true,
        wechatOpenId: existing.wechatOpenId,
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
   * WeChat OA webhook signature: SHA1(sort(token, timestamp, nonce).join('')).
   */
  verifyWebhookSignature(
    token: string,
    timestamp: string,
    nonce: string,
    signature: string,
  ): void {
    const parts = [token, timestamp, nonce].map((p) => p.trim()).sort();
    const wantHex = createHash('sha1').update(parts.join('')).digest('hex');
    const got = Buffer.from(signature.trim().toLowerCase());
    const want = Buffer.from(wantHex.toLowerCase());
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new BadRequestException('Invalid WeChat webhook signature');
    }
  }

  /** Verify using configured WECHAT_TOKEN (direct webhook). */
  verifyDirectWebhookSignature(
    signature: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
  ): void {
    if (!signature?.trim() || !timestamp?.trim() || !nonce?.trim()) {
      throw new BadRequestException(
        'Missing WeChat webhook signature query parameters',
      );
    }
    this.verifyWebhookSignature(
      this.oaToken,
      timestamp,
      nonce,
      signature,
    );
  }

  /**
   * WeChat URL verification handshake: validate signature and return echostr.
   */
  verifySubscription(
    signature: string | undefined,
    timestamp: string | undefined,
    nonce: string | undefined,
    echostr: string | undefined,
  ): string {
    this.verifyDirectWebhookSignature(signature, timestamp, nonce);
    if (!echostr?.trim()) {
      throw new BadRequestException('Missing echostr');
    }
    return echostr;
  }

  /** Parse WeChat Official Account XML push body into normalized events. */
  parseWebhookXML(rawBody: Buffer | string): WechatInboundEvent[] {
    const xml =
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const fromUserName = this.xmlTag(xml, 'FromUserName');
    if (!fromUserName) {
      throw new BadRequestException('Invalid WeChat webhook XML: missing FromUserName');
    }

    const msgType = this.xmlTag(xml, 'MsgType').toLowerCase();
    if (msgType === 'text') {
      const text = this.xmlTag(xml, 'Content');
      const msgId = this.xmlTag(xml, 'MsgId');
      return [
        {
          type: WECHAT_EVENT_MESSAGE,
          user_id: fromUserName,
          ...(msgId ? { message_id: msgId } : {}),
          ...(text ? { text } : {}),
        },
      ];
    }

    if (msgType !== 'event') return [];

    const event = this.xmlTag(xml, 'Event').toLowerCase();
    let eventKey = this.xmlTag(xml, 'EventKey');
    if (eventKey.toLowerCase().startsWith('qrscene_')) {
      eventKey = eventKey.slice('qrscene_'.length);
    }

    if (event === 'subscribe') {
      return [
        {
          type: WECHAT_EVENT_FOLLOW,
          user_id: fromUserName,
          ...(eventKey ? { event_key: eventKey } : {}),
        },
      ];
    }
    if (event === 'unsubscribe') {
      return [{ type: WECHAT_EVENT_UNFOLLOW, user_id: fromUserName }];
    }
    if (event === 'scan') {
      return [
        {
          type: WECHAT_EVENT_SCAN,
          user_id: fromUserName,
          ...(eventKey ? { event_key: eventKey } : {}),
        },
      ];
    }
    return [];
  }

  parseDirectWebhookEvents(rawBody: Buffer): WechatInboundEvent[] {
    return this.parseWebhookXML(rawBody);
  }

  async handleEvents(events: WechatInboundEvent[]): Promise<void> {
    for (const event of events) {
      if (!event.user_id) continue;

      if (event.type === WECHAT_EVENT_FOLLOW) {
        await this.handleFollow(event.user_id, event.event_key);
        continue;
      }

      if (event.type === WECHAT_EVENT_UNFOLLOW) {
        await this.handleUnfollow(event.user_id);
        continue;
      }

      if (event.type === WECHAT_EVENT_SCAN) {
        await this.handleScan(event.user_id, event.event_key);
        continue;
      }

      if (event.type === WECHAT_EVENT_MESSAGE && event.text) {
        await this.handleMessage(event.user_id, event.text);
      }
    }
  }

  private async handleFollow(
    wechatOpenId: string,
    eventKey?: string,
  ): Promise<void> {
    try {
      await this.sendText(wechatOpenId, this.welcomeMessage);
      this.logger.log(`Sent welcome message to WeChat OpenID ${wechatOpenId}`);
    } catch (err) {
      this.logger.error(
        `Failed to welcome WeChat OpenID ${wechatOpenId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const code = this.extractConnectCode(eventKey);
    if (code) {
      await this.tryLinkWithConnectCode(wechatOpenId, code);
    }
  }

  private async handleScan(
    wechatOpenId: string,
    eventKey?: string,
  ): Promise<void> {
    const code = this.extractConnectCode(eventKey);
    if (!code) return;
    await this.tryLinkWithConnectCode(wechatOpenId, code);
  }

  private async handleUnfollow(wechatOpenId: string): Promise<void> {
    const linked = await this.connections.findByWechatOpenId(wechatOpenId);
    if (!linked) return;
    try {
      await this.connections.disconnectByWechatOpenId(wechatOpenId);
      this.logger.log(
        `Disconnected WeChat OpenID ${wechatOpenId} from local user ${linked.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to disconnect on unfollow ${wechatOpenId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async handleMessage(
    wechatOpenId: string,
    text: string,
  ): Promise<void> {
    const match = CONNECT_CODE_RE.exec(text);
    if (!match) return;

    const code = match[1] ?? '';
    await this.tryLinkWithConnectCode(wechatOpenId, code);
  }

  private extractConnectCode(eventKey?: string): string | null {
    const raw = eventKey?.trim();
    if (!raw) return null;
    const connectMatch = CONNECT_CODE_RE.exec(raw);
    if (connectMatch?.[1]) return connectMatch[1];
    if (BARE_CODE_RE.test(raw)) return raw.toUpperCase();
    return null;
  }

  private async tryLinkWithConnectCode(
    wechatOpenId: string,
    code: string,
  ): Promise<void> {
    try {
      await this.linkWithConnectCode(wechatOpenId, code);
    } catch (err) {
      const message =
        err instanceof ConflictException || err instanceof BadRequestException
          ? err.message
          : 'Could not link your account. Please try again from Mosonic settings.';
      try {
        await this.sendText(wechatOpenId, message);
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
          `CONNECT link failed for ${wechatOpenId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async linkWithConnectCode(
    wechatOpenId: string,
    code: string,
  ): Promise<void> {
    const localUserId = await this.connectCodes.consume(code);
    if (!localUserId) {
      throw new BadRequestException(
        'Invalid or expired CONNECT code. Open Mosonic settings and generate a new one.',
      );
    }

    const alreadyLinked =
      await this.connections.findByWechatOpenId(wechatOpenId);
    if (alreadyLinked && alreadyLinked.userId !== localUserId) {
      throw new ConflictException(
        'This WeChat account is already linked to another Mosonic user.',
      );
    }

    await this.connections.upsert(localUserId, wechatOpenId);
    await this.sendText(
      wechatOpenId,
      'Connected successfully! Your Mosonic account is now linked to WeChat.',
    );
    this.logger.log(
      `Linked WeChat OpenID ${wechatOpenId} to local user ${localUserId}`,
    );
  }

  private async qrUrl(
    sceneStr?: string,
    oaUsername?: string,
    size?: number,
    format?: 'json',
  ): Promise<string> {
    const params = new URLSearchParams();
    const scene = sceneStr?.trim();
    if (scene) {
      params.set('scene_str', scene);
    } else {
      params.set('oa_username', oaUsername?.trim() || this.oaUsername);
    }
    if (size) params.set('size', String(size));
    if (format) params.set('format', format);
    return `${this.baseUrl}/api/v1/qr?${params.toString()}`;
  }

  private xmlTag(xml: string, tag: string): string {
    const re = new RegExp(
      `<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      'i',
    );
    const match = re.exec(xml);
    return match?.[1]?.trim() ?? '';
  }

  private async fetchWechat(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, { headers: this.headers(), ...init });
    } catch (err) {
      this.logger.error(
        `wechat-service unreachable: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException('wechat-service is unreachable');
    }
  }
}
