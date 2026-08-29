import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeGateway } from './realtime.gateway';
import { Server, Socket } from 'socket.io';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let mockServer: Partial<Server>;
  let mockSocket: Partial<Socket>;
  let joinedRooms: string[];
  let emittedEvents: Array<{ room?: string; event: string; payload: any }>;

  beforeEach(async () => {
    joinedRooms = [];
    emittedEvents = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [RealtimeGateway],
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
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should join client to unit, gate, society, and user rooms from query params', () => {
      mockSocket.handshake!.query = {
        unitId: 'unit-1',
        gateId: 'gate-1',
        societyId: 'soc-1',
        userId: 'user-1',
      };

      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.join).toHaveBeenCalledWith('unit:unit-1');
      expect(mockSocket.join).toHaveBeenCalledWith('gate:gate-1');
      expect(mockSocket.join).toHaveBeenCalledWith('society:soc-1');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
      expect(joinedRooms).toEqual([
        'unit:unit-1',
        'gate:gate-1',
        'society:soc-1',
        'user:user-1',
      ]);
    });

    it('should join client to rooms from auth params fallback', () => {
      mockSocket.handshake!.query = {};
      mockSocket.handshake!.auth = {
        unitId: 'unit-2',
        gateId: 'gate-2',
        societyId: 'soc-2',
        userId: 'user-2',
      };

      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.join).toHaveBeenCalledWith('unit:unit-2');
      expect(mockSocket.join).toHaveBeenCalledWith('gate:gate-2');
      expect(mockSocket.join).toHaveBeenCalledWith('society:soc-2');
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-2');
    });

    it('should handle connections without query or auth params gracefully', () => {
      mockSocket.handshake!.query = {};
      mockSocket.handshake!.auth = {};

      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(joinedRooms).toHaveLength(0);
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
