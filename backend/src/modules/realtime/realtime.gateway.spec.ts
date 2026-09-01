import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RbacService } from '../rbac/rbac.service';
import { Server, Socket } from 'socket.io';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let mockJwtService: any;
  let mockRbac: any;
  let mockServer: Partial<Server>;
  let mockSocket: Partial<Socket>;
  let joinedRooms: string[];
  let emittedEvents: Array<{ room?: string; event: string; payload: any }>;

  beforeEach(async () => {
    joinedRooms = [];
    emittedEvents = [];

    mockJwtService = {
      verifyAsync: jest.fn(),
    };

    mockRbac = {
      getUserContexts: jest.fn().mockResolvedValue({ units: [], societies: [] }),
      assertPermission: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: RbacService, useValue: mockRbac },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);

    mockServer = {
      to: jest.fn().mockImplementation((room: string) => ({
        emit: jest.fn().mockImplementation((event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        }),
      })),
      emit: jest.fn().mockImplementation((event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      }),
    };

    gateway.server = mockServer as Server;

    mockSocket = {
      id: 'socket-123',
      handshake: {
        query: {},
        auth: {},
        headers: {},
        time: '',
        address: '',
        xdomain: false,
        secure: false,
        issued: 0,
        url: '',
      },
      join: jest.fn().mockImplementation((room: string | string[]) => {
        if (Array.isArray(room)) {
          joinedRooms.push(...room);
        } else {
          joinedRooms.push(room);
        }
        return Promise.resolve();
      }),
      disconnect: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection - authentication', () => {
    it('should disconnect a socket with no token at all', async () => {
      await gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      expect(joinedRooms).toHaveLength(0);
    });

    it('should disconnect a socket whose token fails verification', async () => {
      mockSocket.handshake!.auth = { token: 'bad-token' };
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(joinedRooms).toHaveLength(0);
    });

    it('should accept a Bearer token from the Authorization header', async () => {
      mockSocket.handshake!.headers = { authorization: 'Bearer good-token' };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      await gateway.handleConnection(mockSocket as Socket);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('good-token');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleConnection - room membership is derived server-side, never trusted from the client', () => {
    it('should ignore a client-supplied unitId/societyId that the token owner has no grant for', async () => {
      mockSocket.handshake!.auth = { token: 'good-token' };
      mockSocket.handshake!.query = {
        unitId: 'unit-someone-elses',
        societyId: 'soc-someone-elses',
      };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', isSuperadmin: false });
      mockRbac.getUserContexts.mockResolvedValue({ units: [], societies: [] });

      await gateway.handleConnection(mockSocket as Socket);

      expect(joinedRooms).toEqual(['user:user-1']);
      expect(joinedRooms).not.toContain('unit:unit-someone-elses');
      expect(joinedRooms).not.toContain('society:soc-someone-elses');
    });

    it('should join unit and society rooms resolved from the authenticated user RBAC context', async () => {
      mockSocket.handshake!.auth = { token: 'good-token' };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockRbac.getUserContexts.mockResolvedValue({
        units: [{ unitId: 'unit-1', societyId: 'soc-1', role: 'OWNER' }],
        societies: [{ societyId: 'soc-2', role: 'SOCIETY_ADMIN' }],
      });

      await gateway.handleConnection(mockSocket as Socket);

      expect(joinedRooms).toEqual(
        expect.arrayContaining(['user:user-1', 'unit:unit-1', 'society:soc-2']),
      );
    });

    it('should only join a requested gate room if RBAC grants entry.view@GATE for it', async () => {
      mockSocket.handshake!.auth = { token: 'good-token' };
      mockSocket.handshake!.query = { gateId: 'gate-1' };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'guard-1' });
      mockRbac.getUserContexts.mockResolvedValue({ units: [], societies: [] });
      mockRbac.assertPermission.mockResolvedValue(true);

      await gateway.handleConnection(mockSocket as Socket);

      expect(mockRbac.assertPermission).toHaveBeenCalledWith(
        'guard-1',
        'entry.view',
        'GATE',
        'gate-1',
      );
      expect(joinedRooms).toContain('gate:gate-1');
    });

    it('should not join a requested gate room when RBAC denies it', async () => {
      mockSocket.handshake!.auth = { token: 'good-token' };
      mockSocket.handshake!.query = { gateId: 'gate-not-mine' };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'guard-1' });
      mockRbac.getUserContexts.mockResolvedValue({ units: [], societies: [] });
      mockRbac.assertPermission.mockResolvedValue(false);

      await gateway.handleConnection(mockSocket as Socket);

      expect(joinedRooms).not.toContain('gate:gate-not-mine');
    });

    it('should let a superadmin join any explicitly requested room without an RBAC lookup', async () => {
      mockSocket.handshake!.auth = { token: 'good-token' };
      mockSocket.handshake!.query = {
        unitId: 'unit-any',
        societyId: 'soc-any',
        gateId: 'gate-any',
      };
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'root', isSuperadmin: true });

      await gateway.handleConnection(mockSocket as Socket);

      expect(joinedRooms).toEqual(
        expect.arrayContaining(['user:root', 'unit:unit-any', 'society:soc-any', 'gate:gate-any']),
      );
      expect(mockRbac.getUserContexts).not.toHaveBeenCalled();
      expect(mockRbac.assertPermission).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should handle disconnect without error', () => {
      expect(() => gateway.handleDisconnect(mockSocket as Socket)).not.toThrow();
    });
  });

  describe('emit helpers', () => {
    it('should emit event to specific unit room', () => {
      gateway.emitToUnit('unit-101', 'visitor.arrival', { visitorId: 'v-1' });

      expect(mockServer.to).toHaveBeenCalledWith('unit:unit-101');
      expect(emittedEvents).toContainEqual({
        room: 'unit:unit-101',
        event: 'visitor.arrival',
        payload: { visitorId: 'v-1' },
      });
    });

    it('should emit event to specific gate room', () => {
      gateway.emitToGate('gate-main', 'barrier.open', { reason: 'approved' });

      expect(mockServer.to).toHaveBeenCalledWith('gate:gate-main');
      expect(emittedEvents).toContainEqual({
        room: 'gate:gate-main',
        event: 'barrier.open',
        payload: { reason: 'approved' },
      });
    });

    it('should emit event to specific society room', () => {
      gateway.emitToSociety('soc-100', 'announcement', { title: 'Water cutoff' });

      expect(mockServer.to).toHaveBeenCalledWith('society:soc-100');
      expect(emittedEvents).toContainEqual({
        room: 'society:soc-100',
        event: 'announcement',
        payload: { title: 'Water cutoff' },
      });
    });

    it('should emit event to specific user room', () => {
      gateway.emitToUser('user-999', 'approval.required', { approvalId: 'app-1' });

      expect(mockServer.to).toHaveBeenCalledWith('user:user-999');
      expect(emittedEvents).toContainEqual({
        room: 'user:user-999',
        event: 'approval.required',
        payload: { approvalId: 'app-1' },
      });
    });
  });
});
