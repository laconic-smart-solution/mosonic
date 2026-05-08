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
import { EventsService } from './events.service';

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

  constructor(private readonly eventsService: EventsService) {}

  afterInit() {
    this.eventsService.setServer(this.server);
    this.logger.log('Socket.IO gateway ready');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = body?.room?.trim();
    if (!room) {
      return { ok: false as const, error: 'room is required' };
    }
    void client.join(room);
    return { ok: true as const, room };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = body?.room?.trim();
    if (!room) {
      return { ok: false as const, error: 'room is required' };
    }
    void client.leave(room);
    return { ok: true as const, room };
  }
}
