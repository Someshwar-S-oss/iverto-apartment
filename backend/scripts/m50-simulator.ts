import WebSocket from 'ws';
import { M50XmlCodec } from '../src/modules/m50/m50.xml-codec';

export interface SimulatorOptions {
  url?: string;
  serial?: string;
  user?: string;
  userName?: string;
  cloudId?: string;
  scanInterval?: number; // in seconds
  stay?: boolean;
  logImageBase64?: string;
  autoStart?: boolean;
}

export interface StoredLog {
  logId: number;
  logPos: number;
  userId: string;
  userName: string;
  time: string;
  action: string;
  attendStat: string;
  image?: string;
}

export class M50Simulator {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private logCount = 0;
  private logHistory: StoredLog[] = [];
  private isConnected = false;
  private isLoggedIn = false;

  public readonly url: string;
  public readonly serial: string;
  public readonly userId: string;
  public readonly userName: string;
  public readonly cloudId: string;
  public readonly scanInterval: number;
  public readonly stay: boolean;
  public readonly logImage: string;

  // 1x1 transparent JPEG base64 fallback
  public static readonly DEFAULT_JPEG_BASE64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  constructor(options: SimulatorOptions = {}) {
    this.url = options.url || 'ws://localhost:8031/m50';
    this.serial = options.serial || 'DJ20250307014';
    this.userId = options.user || '1';
    this.userName = options.userName || 'Simulator Staff';
    this.cloudId = options.cloudId || '';
    this.scanInterval = options.scanInterval != null ? options.scanInterval : 5;
    this.stay = options.stay ?? false;
    this.logImage = options.logImageBase64 || M50Simulator.DEFAULT_JPEG_BASE64;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[M50 Simulator] Connecting to ${this.url} (Device: ${this.serial})...`);
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log(`[M50 Simulator] Connected to WebSocket gateway.`);
        this.sendRegister();
        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        const rawXml = typeof data === 'string' ? data : data.toString('utf-8');
        this.handleIncomingXml(rawXml);
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this.isLoggedIn = false;
        this.stopTimers();
        console.log(`[M50 Simulator] Connection closed (${code}: ${reason.toString()})`);
      });

      this.ws.on('error', (err) => {
        console.error('[M50 Simulator] WebSocket error:', err.message);
        if (!this.isConnected) {
          reject(err);
        }
      });
    });
  }

  public disconnect(): void {
    this.stopTimers();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.isConnected = false;
    this.isLoggedIn = false;
  }

  private sendXml(xml: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[M50 Simulator -> Server]:\n${xml.trim()}`);
      this.ws.send(xml);
    } else {
      console.warn('[M50 Simulator] Cannot send message: WebSocket is not open');
    }
  }

  public sendRegister(): void {
    const xml = `<?xml version="1.0"?>
<Message>
  <Request>Register</Request>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <CloudId>${this.cloudId}</CloudId>
</Message>`;
    this.sendXml(xml);
  }

  public sendLogin(token: string): void {
    const xml = `<?xml version="1.0"?>
<Message>
  <Request>Login</Request>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <Token>${token}</Token>
</Message>`;
    this.sendXml(xml);
  }

  public sendKeepAlive(): void {
    const devTime = M50XmlCodec.formatDeviceTime();
    const xml = `<?xml version="1.0"?>
<Message>
  <Event>KeepAlive</Event>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <DevTime>${devTime}</DevTime>
</Message>`;
    this.sendXml(xml);
  }

  public sendTimeLog(
    options: {
      userId?: string;
      userName?: string;
      attendStat?: 'Duty On' | 'Duty Off' | 'In' | 'Out';
      logImage?: string;
    } = {},
  ): void {
    this.logCount += 1;
    const logId = this.logCount;
    const logPos = this.logCount;
    const transId = `trans-${Date.now()}-${logId}`;
    const targetUserId = options.userId || this.userId;
    const targetUserName = options.userName || this.userName;
    const attendStat = options.attendStat || (logId % 2 === 1 ? 'Duty On' : 'Duty Off');
    const imagePayload = options.logImage !== undefined ? options.logImage : this.logImage;
    const devTime = M50XmlCodec.formatDeviceTime();

    // Store in internal history for backfill queries
    this.logHistory.push({
      logId,
      logPos,
      userId: targetUserId,
      userName: targetUserName,
      time: devTime,
      action: 'Face',
      attendStat,
      image: imagePayload,
    });

    const encodedName = M50XmlCodec.encodeUtf16leBase64(targetUserName);

    const xml = `<?xml version="1.0"?>
<Message>
  <Event>TimeLog_v2</Event>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <TransID>${transId}</TransID>
  <LogID>${logId}</LogID>
  <LogPos>${logPos}</LogPos>
  <UserID>${targetUserId}</UserID>
  <UserName>${encodedName}</UserName>
  <Action>Face</Action>
  <AttendStat>${attendStat}</AttendStat>
  <Time>${devTime}</Time>
  <LogImage>${imagePayload}</LogImage>
</Message>`;

    this.sendXml(xml);
  }

  public sendAdminLog(action = 'MenuAccess', adminId = '0'): void {
    const transId = `admin-trans-${Date.now()}`;
    const devTime = M50XmlCodec.formatDeviceTime();

    const xml = `<?xml version="1.0"?>
<Message>
  <Event>AdminLog_v2</Event>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <TransID>${transId}</TransID>
  <AdminID>${adminId}</AdminID>
  <Action>${action}</Action>
  <Time>${devTime}</Time>
</Message>`;

    this.sendXml(xml);
  }

  private handleIncomingXml(xml: string): void {
    console.log(`[Server -> M50 Simulator]:\n${xml.trim()}`);
    const parsed = M50XmlCodec.parseXml(xml);
    const message = parsed?.Message;
    if (!message) return;

    const response = message.Response;
    const request = message.Request || message.Reuqest;

    // Handle Server Responses
    if (response) {
      this.handleServerResponse(response, message);
    }

    // Handle Server Requests / Commands (Backfill, etc.)
    if (request) {
      this.handleServerRequest(request, message);
    }
  }

  private handleServerResponse(responseType: string, message: any): void {
    const result = message.Result;

    switch (responseType) {
      case 'Register':
        if (result === 'OK' && message.Token) {
          this.token = String(message.Token);
          console.log(`[M50 Simulator] Registered successfully. Auth token: ${this.token}`);
          this.sendLogin(this.token);
        } else {
          console.error(`[M50 Simulator] Registration failed: Result=${result}`);
        }
        break;

      case 'Login':
        if (result === 'OK') {
          this.isLoggedIn = true;
          console.log(`[M50 Simulator] Logged in successfully!`);
          this.onLoggedIn();
        } else {
          console.error(`[M50 Simulator] Login failed: Result=${result}`);
        }
        break;

      case 'KeepAlive':
        console.log(`[M50 Simulator] KeepAlive ACK received. ServerTime: ${message.ServerTime}`);
        break;

      case 'TimeLog_v2':
      case 'TimeLog':
        console.log(`[M50 Simulator] TimeLog ACK: TransID=${message.TransID}, Result=${result}`);
        break;

      case 'AdminLog_v2':
      case 'AdminLog':
        console.log(`[M50 Simulator] AdminLog ACK: TransID=${message.TransID}, Result=${result}`);
        break;

      default:
        console.log(`[M50 Simulator] Response received for ${responseType}: Result=${result}`);
        break;
    }
  }

  private handleServerRequest(requestType: string, message: any): void {
    console.log(`[M50 Simulator] Processing server command: ${requestType}`);

    switch (requestType) {
      case 'GetGlogPosInfo': {
        const responseXml = `<?xml version="1.0"?>
<Message>
  <Response>GetGlogPosInfo</Response>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <LogCount>${this.logHistory.length}</LogCount>
  <MaxCount>500000</MaxCount>
  <Result>OK</Result>
</Message>`;
        this.sendXml(responseXml);
        break;
      }

      case 'GetFirstGlog': {
        const beginPos = parseInt(String(message.BeginLogPos || '0'), 10);
        const log = this.logHistory.find((l) => l.logPos >= beginPos) || this.logHistory[0];
        if (log) {
          const responseXml = `<?xml version="1.0"?>
<Message>
  <Response>GetFirstGlog</Response>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <LogID>${log.logId}</LogID>
  <LogPos>${log.logPos}</LogPos>
  <UserID>${log.userId}</UserID>
  <Action>${log.action}</Action>
  <AttendStat>${log.attendStat}</AttendStat>
  <Time>${log.time}</Time>
  <Result>OK</Result>
</Message>`;
          this.sendXml(responseXml);
        } else {
          const responseXml = `<?xml version="1.0"?>
<Message>
  <Response>GetFirstGlog</Response>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <Result>Fail</Result>
</Message>`;
          this.sendXml(responseXml);
        }
        break;
      }

      case 'GetNextGlog': {
        const beginPos = parseInt(String(message.BeginLogPos || '0'), 10);
        const log = this.logHistory.find((l) => l.logPos > beginPos);
        if (log) {
          const responseXml = `<?xml version="1.0"?>
<Message>
  <Response>GetNextGlog</Response>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <LogID>${log.logId}</LogID>
  <LogPos>${log.logPos}</LogPos>
  <UserID>${log.userId}</UserID>
  <Action>${log.action}</Action>
  <AttendStat>${log.attendStat}</AttendStat>
  <Time>${log.time}</Time>
  <Result>OK</Result>
</Message>`;
          this.sendXml(responseXml);
        } else {
          const responseXml = `<?xml version="1.0"?>
<Message>
  <Response>GetNextGlog</Response>
  <DeviceSerialNo>${this.serial}</DeviceSerialNo>
  <Result>Fail</Result>
</Message>`;
          this.sendXml(responseXml);
        }
        break;
      }

      default:
        console.log(`[M50 Simulator] Unhandled server request: ${requestType}`);
        break;
    }
  }

  private onLoggedIn(): void {
    // Send immediate KeepAlive
    this.sendKeepAlive();

    // Start 30s keepalive loop
    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAlive();
    }, 30000);

    // Send first scan
    this.sendTimeLog();

    if (this.scanInterval > 0 && this.stay) {
      console.log(
        `[M50 Simulator] Periodic scanning enabled every ${this.scanInterval}s (Press Ctrl+C to stop)`,
      );
      this.scanTimer = setInterval(() => {
        this.sendTimeLog();
      }, this.scanInterval * 1000);
    } else if (!this.stay) {
      // If not staying open, disconnect after 2 seconds
      setTimeout(() => {
        console.log('[M50 Simulator] Finished one-shot simulation run. Disconnecting.');
        this.disconnect();
      }, 2000);
    }
  }

  private stopTimers(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  public getLogHistory(): StoredLog[] {
    return [...this.logHistory];
  }

  public getIsLoggedIn(): boolean {
    return this.isLoggedIn;
  }
}

// CLI entry point
function parseArgs(args: string[]): SimulatorOptions {
  const options: SimulatorOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      options.url = args[++i];
    } else if (arg === '--serial' && args[i + 1]) {
      options.serial = args[++i];
    } else if (arg === '--user' && args[i + 1]) {
      options.user = args[++i];
    } else if (arg === '--user-name' && args[i + 1]) {
      options.userName = args[++i];
    } else if (arg === '--cloud-id' && args[i + 1]) {
      options.cloudId = args[++i];
    } else if (arg === '--scan-interval' && args[i + 1]) {
      options.scanInterval = parseFloat(args[++i]);
    } else if (arg === '--stay') {
      options.stay = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
M50 Biometric Terminal Hardware Simulator
Usage:
  npx ts-node scripts/m50-simulator.ts [options]

Options:
  --url <url>              WebSocket gateway URL (default: ws://localhost:8031/m50)
  --serial <serialNo>      Device serial number (default: DJ20250307014)
  --user <userId>          User ID to scan (default: 1)
  --user-name <name>       User name (default: Simulator Staff)
  --cloud-id <cloudId>     Device Cloud ID secret (optional)
  --scan-interval <sec>    Interval between scans in seconds (default: 5)
  --stay                   Keep connection open with keepalives and periodic scans
  --help                   Display this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const simulator = new M50Simulator(options);
  simulator.connect().catch((err) => {
    console.error('[M50 Simulator] Fatal connection error:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n[M50 Simulator] Stopping simulator...');
    simulator.disconnect();
    process.exit(0);
  });
}
