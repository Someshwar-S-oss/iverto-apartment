import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { Server, ServerOptions } from 'socket.io';
import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { M50Server } from '../../modules/m50/m50.server';
import { ConfigService } from '@nestjs/config';

export class SharedHttpIoAdapter extends IoAdapter {
  private readonly logger = new Logger(SharedHttpIoAdapter.name);
  private m50Server?: M50Server;
  private m50Path = '/m50';

  constructor(private readonly app: INestApplicationContext) {
    super(app);
    this.resolveM50();
  }

  private resolveM50() {
    try {
      const configService = this.app.get(ConfigService, { strict: false });
      if (configService) {
        this.m50Path = configService.get<string>('m50.path') || '/m50';
      }
    } catch {
      // ignore
    }

    try {
      this.m50Server = this.app.get(M50Server, { strict: false });
    } catch {
      // ignore
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    this.resolveM50();

    const serverOptions: any = {
      ...options,
      destroyUpgrade: false, // CRITICAL: prevent Engine.IO from destroying non-socket.io upgrades
    };

    const server: Server = super.createIOServer(port, serverOptions);

    const httpServer: HttpServer = (server as any).httpServer || (this.app as any).getHttpServer?.();
    if (httpServer && typeof httpServer.on === 'function') {
      this.attachUpgradeHandler(httpServer);
    }

    return server;
  }

  public attachUpgradeHandler(httpServer: HttpServer) {
    if (!this.m50Server) {
      this.resolveM50();
    }

    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname = '';
      try {
        pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
      } catch {
        pathname = req.url?.split('?')[0] ?? '';
      }

      if (pathname === this.m50Path && this.m50Server) {
        this.m50Server.handleUpgrade(req, socket, head);
        return;
      }

      // Clean up unrecognized socket upgrades after 1s
      if (!pathname.startsWith('/socket.io') && pathname !== this.m50Path) {
        const rawSocket = socket as Duplex & { bytesWritten?: number };
        setTimeout(() => {
          if (!rawSocket.destroyed && rawSocket.writable && (rawSocket.bytesWritten ?? 0) === 0) {
            rawSocket.destroy();
          }
        }, 1000);
      }
    });
  }
}
