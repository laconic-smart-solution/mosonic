import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { WsAuthService } from '../auth/ws-auth.service';
import { rednoteLoginRoom } from './rednote.constants';

type AuthenticatedSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  namespace: '/rednote',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RedNoteGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RedNoteGateway.name);
  /** Last QR frame per user — replayed when the client joins after the worker already started. */
  private readonly lastQrByUser = new Map<string, string>();

  @WebSocketServer()
  server!: Server;

  constructor(private readonly wsAuth: WsAuthService) {}

  afterInit() {
    this.logger.log('Socket.IO namespace /rednote ready');
  }

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.wsAuth.resolveSocketAccessToken(client.handshake);
    try {
      const { userId } = await this.wsAuth.authenticateSocketToken(token);
      client.data.userId = userId;
      // Auto-join so frames are not lost if the client never emits join-login-session
      // (or emits it after the first qr_frame).
      const room = rednoteLoginRoom(userId);
      await client.join(room);
      this.logger.log(`RedNote WS ${client.id} joined ${room}`);
      const cached = this.lastQrByUser.get(userId);
      if (cached) {
        client.emit('qr_frame', { image: cached });
        this.logger.log(
          `RedNote WS ${client.id} replayed cached QR bytes≈${cached.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `RedNote WS ${client.id} auth failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join-login-session')
  async handleJoin(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (!userId) {
      return { ok: false, error: 'unauthorized' };
    }
    const room = rednoteLoginRoom(userId);
    await client.join(room);
    const cached = this.lastQrByUser.get(userId);
    if (cached) {
      client.emit('qr_frame', { image: cached });
    }
    this.logger.debug(`RedNote WS ${client.id} re-joined ${room}`);
    return { ok: true, room };
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (event === 'qr_frame') {
      const image =
        payload &&
        typeof payload === 'object' &&
        'image' in payload &&
        typeof (payload as { image: unknown }).image === 'string'
          ? (payload as { image: string }).image
          : null;
      if (image) this.lastQrByUser.set(userId, image);
    }
    if (event === 'login_success' || event === 'login_failed') {
      this.lastQrByUser.delete(userId);
    }
    if (!this.server) {
      this.logger.warn(`RedNote emit ${event} skipped — server not ready`);
      return;
    }
    const room = rednoteLoginRoom(userId);
    const size =
      this.server.sockets?.adapter?.rooms?.get(room)?.size ?? 0;
    this.logger.debug(
      `RedNote emit ${event} room=${room} listeners=${size}`,
    );
    this.server.to(room).emit(event, payload);
  }

  getLatestQrFrame(userId: string): string | null {
    return this.lastQrByUser.get(userId) ?? null;
  }

  clearQrCache(userId: string): void {
    this.lastQrByUser.delete(userId);
  }
}
