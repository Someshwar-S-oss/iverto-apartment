import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { M50Server } from './m50.server';
import { M50Service } from './m50.service';

describe('M50Server', () => {
  let server: M50Server;
  let mockM50Service: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockM50Service = {
      handleMessage: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'm50.path') return '/m50';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        M50Server,
        {
          provide: M50Service,
          useValue: mockM50Service,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    server = module.get<M50Server>(M50Server);
  });

  afterEach(() => {
    server.onModuleDestroy();
  });

  it('should initialize WebSocketServer and configure m50 path', () => {
    server.onModuleInit();
    expect(server.getPath()).toBe('/m50');
    expect(server.getWss()).toBeDefined();
  });

  it('should delegate handleUpgrade to underlying WebSocketServer', () => {
    server.onModuleInit();
    const wss = server.getWss();
    const handleUpgradeSpy = jest.spyOn(wss, 'handleUpgrade').mockImplementation((req, socket, head, cb) => {
      // noop
    });

    const mockReq = { url: '/m50', headers: {} } as any;
    const mockSocket = {} as any;
    const mockHead = Buffer.from([]);

    server.handleUpgrade(mockReq, mockSocket, mockHead);
    expect(handleUpgradeSpy).toHaveBeenCalledWith(mockReq, mockSocket, mockHead, expect.any(Function));
  });
});
