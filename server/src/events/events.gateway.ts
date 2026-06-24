import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { WsAuthService } from '../auth/ws-auth.service';
import { isUserScopedRoom, userRoom } from './notification.util';
import { EventsService } from './events.service';

type AuthenticatedSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly eventsService: EventsService,
    private readonly wsAuth: WsAuthService,
  ) {}

  afterInit() {
    this.eventsService.setServer(this.server);
    this.logger.log('Socket.IO gateway ready');
  }

  async handleConnection(client: AuthenticatedSocket) {
    const token =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : undefined;

    try {
      const { userId } = await this.wsAuth.authenticateSocketToken(token);
      client.data.userId = userId;
      await client.join(userRoom(userId));
      this.logger.debug(`Client ${client.id} joined ${userRoom(userId)}`);
    } catch (err) {
      this.logger.debug(
        `Client ${client.id} connected without auth: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = body?.room?.trim();
    if (!room) {
      return { ok: false as const, error: 'room is required' };
    }

    if (isUserScopedRoom(room)) {
      const userId = client.data.userId;
      if (!userId || room !== userRoom(userId)) {
        return { ok: false as const, error: 'cannot join another user room' };
      }
    } else if (!client.data.userId) {
      return {
        ok: false as const,
        error: 'Authentication required to join this room',
      };
    }

    void client.join(room);
    return { ok: true as const, room };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = body?.room?.trim();
    if (!room) {
      return { ok: false as const, error: 'room is required' };
    }

    if (isUserScopedRoom(room)) {
      const userId = client.data.userId;
      if (!userId || room !== userRoom(userId)) {
        return { ok: false as const, error: 'cannot leave another user room' };
      }
    } else if (!client.data.userId) {
      return {
        ok: false as const,
        error: 'Authentication required to leave this room',
      };
    }

    void client.leave(room);
    return { ok: true as const, room };
  }
}
