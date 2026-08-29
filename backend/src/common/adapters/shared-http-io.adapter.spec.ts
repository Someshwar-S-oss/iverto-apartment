import { SharedHttpIoAdapter } from './shared-http-io.adapter';
import { M50Server } from '../../modules/m50/m50.server';
import { ConfigService } from '@nestjs/config';

describe('SharedHttpIoAdapter', () => {
  let adapter: SharedHttpIoAdapter;
  let mockApp: any;
  let mockM50Server: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockM50Server = {
      handleUpgrade: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'm50.path') return '/m50';
        return null;
      }),
    };

    mockApp = {
      get: jest.fn((token: any) => {
        if (token === M50Server) return mockM50Server;
        if (token === ConfigService) return mockConfigService;
        return null;
      }),
    };

    adapter = new SharedHttpIoAdapter(mockApp);
  });

  it('should instantiate and configure M50 path', () => {
    expect(adapter).toBeDefined();
  });

  it('should dispatch /m50 upgrades to M50Server', () => {
    const listeners: Record<string, Function> = {};
    const mockHttpServer = {
      on: jest.fn((event: string, handler: Function) => {
        listeners[event] = handler;
      }),
    } as any;

    adapter.attachUpgradeHandler(mockHttpServer);
    expect(mockHttpServer.on).toHaveBeenCalledWith('upgrade', expect.any(Function));

    const upgradeHandler = listeners['upgrade'];
    const mockReq = {
      url: '/m50',
      headers: { host: 'localhost:8031' },
    } as any;
    const mockSocket = {} as any;
    const mockHead = Buffer.from([]);

    upgradeHandler(mockReq, mockSocket, mockHead);
    expect(mockM50Server.handleUpgrade).toHaveBeenCalledWith(mockReq, mockSocket, mockHead);
  });
});
