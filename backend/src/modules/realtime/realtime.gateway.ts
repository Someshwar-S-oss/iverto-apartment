import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    const query = client.handshake?.query || {};
    const auth = client.handshake?.auth || {};

    const unitId = (query.unitId || auth.unitId) as string | undefined;
    const gateId = (query.gateId || auth.gateId) as string | undefined;
    const societyId = (query.societyId || auth.societyId) as string | undefined;
    const userId = (query.userId || auth.userId) as string | undefined;

    if (unitId) client.join(`unit:${unitId}`);
    if (gateId) client.join(`gate:${gateId}`);
    if (societyId) client.join(`society:${societyId}`);
    if (userId) client.join(`user:${userId}`);

    this.logger.log(
      `Client connected: ${client.id} (user: ${userId || 'none'}, unit: ${unitId || 'none'}, gate: ${gateId || 'none'}, society: ${societyId || 'none'})`,
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToUnit(unitId: string, event: string, payload: any) {
    this.server?.to(`unit:${unitId}`).emit(event, payload);
  }

  emitToGate(gateId: string, event: string, payload: any) {
    this.server?.to(`gate:${gateId}`).emit(event, payload);
  }

  emitToSociety(societyId: string, event: string, payload: any) {
    this.server?.to(`society:${societyId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
