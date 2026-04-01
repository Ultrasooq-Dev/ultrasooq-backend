import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws-support',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class SupportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SupportGateway.name);
  private userSockets: Map<number, string> = new Map(); // userId → socketId

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = parseInt(client.handshake.query.userId as string);
    if (userId) {
      this.userSockets.set(userId, client.id);
      client.join(`user:${userId}`);
    }
    this.logger.debug(`Support client connected: ${client.id} (user: ${userId})`);
  }

  handleDisconnect(client: Socket) {
    const userId = parseInt(client.handshake.query.userId as string);
    if (userId) {
      this.userSockets.delete(userId);
    }
    this.logger.debug(`Support client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(client: Socket, data: { conversationId: number }) {
    client.join(`conversation:${data.conversationId}`);
  }

  /**
   * Emit a new message to all participants of a conversation.
   */
  emitNewMessage(conversationId: number, message: any) {
    this.server.to(`conversation:${conversationId}`).emit('new_support_message', message);
  }

  /**
   * Emit conversation status change.
   */
  emitStatusChange(conversationId: number, status: string) {
    this.server.to(`conversation:${conversationId}`).emit('support_status_change', { conversationId, status });
  }

  /**
   * Notify admin room about new escalation.
   */
  emitNewEscalation(conversation: any) {
    this.server.emit('new_escalation', conversation);
  }

  /**
   * Notify a specific user.
   */
  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
