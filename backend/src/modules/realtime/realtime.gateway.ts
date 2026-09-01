import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RbacService } from '../rbac/rbac.service';
import { ScopeType } from '../rbac/rbac.constants';

interface RealtimeJwtPayload {
  sub: string;
  isSuperadmin?: boolean;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Every room joined here carries live visitor names/phones, approval requests, and
   * staff arrivals for a specific unit/society/gate. Room membership must therefore be
   * derived from the caller's own JWT + RBAC grants — never from client-supplied query
   * or auth params, which any unauthenticated socket could set to any tenant's id.
   */
  async handleConnection(client: Socket) {
    const payload = await this.authenticate(client);
    if (!payload) {
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;
    await client.join(`user:${userId}`);

    const isSuperadmin = !!payload.isSuperadmin;
    const requestedGateId = this.readParam(client, 'gateId');

    if (isSuperadmin) {
      // Superadmins bypass RBAC everywhere else (RbacService.assertPermission) and
      // typically hold no unit/society rows of their own, so honor explicit requests.
      const requestedUnitId = this.readParam(client, 'unitId');
      const requestedSocietyId = this.readParam(client, 'societyId');
      if (requestedUnitId) await client.join(`unit:${requestedUnitId}`);
      if (requestedSocietyId) await client.join(`society:${requestedSocietyId}`);
      if (requestedGateId) await client.join(`gate:${requestedGateId}`);
    } else {
      const contexts = await this.rbac.getUserContexts(userId);
      for (const unit of contexts.units) {
        await client.join(`unit:${unit.unitId}`);
      }
      for (const society of contexts.societies) {
        await client.join(`society:${society.societyId}`);
      }

      // Gate rooms aren't modeled as a membership table (a guard app declares which
      // physical gate it's stationed at), so the client may still request one — but it
      // only takes effect if RBAC actually grants that gate to this user.
      if (requestedGateId) {
        const allowed = await this.rbac.assertPermission(
          userId,
          'entry.view',
          ScopeType.GATE,
          requestedGateId,
        );
        if (allowed) {
          await client.join(`gate:${requestedGateId}`);
        } else {
          this.logger.warn(
            `User ${userId} requested unauthorized gate room ${requestedGateId}; ignoring`,
          );
        }
      }
    }

    this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
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

  private async authenticate(client: Socket): Promise<RealtimeJwtPayload | null> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected unauthenticated socket connection: ${client.id}`);
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<RealtimeJwtPayload>(token);
      if (!payload?.sub) {
        return null;
      }
      return payload;
    } catch {
      this.logger.warn(`Rejected socket connection with invalid/expired token: ${client.id}`);
      return null;
    }
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake?.auth || {};
    const query = client.handshake?.query || {};
    const headers = client.handshake?.headers || {};

    if (typeof auth.token === 'string' && auth.token) {
      return auth.token;
    }

    const authHeader = headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    if (typeof query.token === 'string' && query.token) {
      return query.token;
    }

    return undefined;
  }

  private readParam(client: Socket, key: 'unitId' | 'gateId' | 'societyId'): string | undefined {
    const query = client.handshake?.query || {};
    const auth = client.handshake?.auth || {};
    const value = query[key] ?? auth[key];
    return typeof value === 'string' && value ? value : undefined;
  }
}
