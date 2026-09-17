import { Controller, Get } from '@nestjs/common';

// Deliberately left out of setGlobalPrefix (see main.ts's `exclude: ['health']`) so it
// answers at a fixed, prefix-independent path — Caddy and systemd both need somewhere to
// poll that doesn't depend on knowing this instance's API_PREFIX.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
