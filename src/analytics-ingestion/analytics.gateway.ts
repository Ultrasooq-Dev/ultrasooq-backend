import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  namespace: '/ws-analytics',
  cors: { origin: '*', credentials: true },
})
export class AnalyticsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AnalyticsGateway.name);
  private connectedClients = 0;

  constructor(private prisma: PrismaService) {}

  afterInit() {
    this.logger.log('Analytics WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.log(
      `Client connected: ${client.id} (${this.connectedClients} total)`,
    );
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(
      `Client disconnected: ${client.id} (${this.connectedClients} total)`,
    );
  }

  @Cron('*/30 * * * * *') // Every 30 seconds
  async broadcastStats() {
    if (this.connectedClients === 0) return;

    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Count recent requests
      const recent = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*)::bigint as count FROM system_log WHERE "createdAt" >= $1`,
        fiveMinAgo,
      );

      // Count active sessions
      const sessions = await this.prisma
        .$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT COUNT(*)::bigint as count FROM "VisitorSession" WHERE "lastActiveAt" >= $1`,
          fiveMinAgo,
        )
        .catch(() => [{ count: 0n }]);

      const eventsPerMinute = Math.round(
        Number(recent[0]?.count || 0) / 5,
      );

      this.server.emit('stats_update', {
        activeVisitors: Number(sessions[0]?.count || 0),
        eventsPerMinute,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Silent fail — gateway should not crash on DB errors
    }
  }

  // Called by LoggingInterceptor or AnalyticsIngestionService to emit live events
  emitLiveEvent(event: {
    method: string;
    path: string;
    statusCode: number;
    delay: string;
  }) {
    if (this.connectedClients === 0) return;
    this.server.emit('live_event', {
      ...event,
      timestamp: new Date().toISOString(),
    });
  }
}
