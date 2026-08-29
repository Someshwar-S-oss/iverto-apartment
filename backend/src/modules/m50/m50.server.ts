import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { M50XmlCodec } from './m50.xml-codec';
import { M50Service } from './m50.service';

@Injectable()
export class M50Server implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(M50Server.name);
  private wss!: WebSocketServer;
  private m50Path: string = '/m50';

  constructor(
    private readonly m50Service: M50Service,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.m50Path = this.config.get<string>('m50.path') || '/m50';
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 512 * 1024, // 512KB for Base64 photos
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const remoteAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      this.logger.log(`M50 Terminal connected from ${remoteAddress}`);

      ws.on('message', async (data: Buffer | string) => {
        try {
          const xml = typeof data === 'string' ? data : data.toString('utf-8');
          const parsed = M50XmlCodec.parseXml(xml);
          const responseXml = await this.m50Service.handleMessage(parsed, ws);
          if (responseXml && ws.readyState === WebSocket.OPEN) {
            ws.send(responseXml);
          }
        } catch (err) {
          this.logger.error('Error processing M50 message frame', err);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.logger.log(`M50 Terminal disconnected: code=${code}, reason=${reason?.toString() || ''}`);
      });

      ws.on('error', (err: Error) => {
        this.logger.error('M50 Terminal WebSocket error', err);
      });
    });

    this.logger.log(`M50 Terminal Server initialized for path: ${this.m50Path}`);
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    if (!this.wss) {
      this.onModuleInit();
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  getPath(): string {
    return this.m50Path;
  }

  getWss(): WebSocketServer {
    return this.wss;
  }

  onModuleDestroy() {
    if (this.wss) {
      this.wss.close();
    }
  }
}
