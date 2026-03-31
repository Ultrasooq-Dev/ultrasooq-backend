import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws-analytics',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class AnalyticsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AnalyticsGateway.name);
  private connectedAdmins = 0;

  @WebSocketServer()
  server: Server;

  afterInit() {
    this.logger.log('Analytics WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.connectedAdmins++;
    this.logger.debug(`Admin connected: ${client.id} (total: ${this.connectedAdmins})`);
  }

  handleDisconnect(client: Socket) {
    this.connectedAdmins--;
    this.logger.debug(`Admin disconnected: ${client.id} (total: ${this.connectedAdmins})`);
  }

  /**
   * Emit real-time stats update to all connected admin dashboards.
   */
  emitStatsUpdate(data: {
    activeVisitors: number;
    eventsPerMinute: number;
  }) {
    if (this.connectedAdmins > 0) {
      this.server.emit('stats_update', data);
    }
  }

  /**
   * Emit a new event notification to admin dashboards.
   */
  emitNewEvent(event: { eventName: string; pageUrl?: string; createdAt: string }) {
    if (this.connectedAdmins > 0) {
      this.server.emit('new_event', event);
    }
  }

  /**
   * Emit alert when a system component is degraded/down.
   */
  emitHealthAlert(data: { component: string; status: string; responseMs?: number }) {
    if (this.connectedAdmins > 0) {
      this.server.emit('health_alert', data);
    }
  }

  /**
   * Emit alert when a new unique error is first seen.
   */
  emitNewError(data: { fingerprint: string; message: string; source: string }) {
    if (this.connectedAdmins > 0) {
      this.server.emit('new_error', data);
    }
  }
}
