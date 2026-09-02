import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { SharedHttpIoAdapter } from './common/adapters/shared-http-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Nest's default Express body parser caps requests at 100kb, which is far too small
  // for the base64-encoded visitor/staff/delivery photos the mobile guard app uploads
  // (JSON payload with photoBase64) — that produced "request entity too large" (413)
  // errors on visitor registration. Raise the limit to comfortably fit a compressed
  // camera capture encoded as base64 (~33% larger than the raw image).
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Baseline security headers (HSTS, X-Content-Type-Options, disabled X-Powered-By, etc).
  // CSP is disabled because it would otherwise block Swagger UI's inline bootstrap
  // script at /api/docs; the other protections still apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Enable CORS. `credentials: true` is intentionally never combined with a wildcard
  // origin — browsers reject that pairing outright, and this API is Bearer-token
  // authenticated (not cookie-based), so credentialed CORS isn't needed even when a
  // specific origin allowlist is configured via CORS_ORIGINS.
  const corsOrigins = configService.get<string[] | string>('cors.origins') || '*';
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: false,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Shared HTTP IO Adapter handling both Socket.IO and M50 raw WebSocket connections
  const adapter = new SharedHttpIoAdapter(app);
  app.useWebSocketAdapter(adapter);

  // Swagger API Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Iverto Gate Management API')
    .setDescription(
      'Cloud Backend API for Gated Community Management, M50 Facial Recognition Biometrics, Scoped RBAC, and Resident/Guard Mobile Applications.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'User Authentication, Login & Mandatory Password Reset')
    .addTag('Web - Superadmin', 'Platform-wide Client Society Onboarding, Global Hardware & Analytics')
    .addTag('Web - Society Admin', 'Society Dashboard, Roster Management, Units, Staff & Audit Logs')
    .addTag('Mobile - Auth', 'Context Switching & FCM Push Token Registration')
    .addTag('Mobile - Resident', 'Unit Visitor Approvals, Entry Events, Passcodes & Delivery Rules')
    .addTag('Mobile - Guard', 'Gate Directory Search, Visitor Entry Logging, Passcode Verification & Photo Streaming')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Iverto API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('port') || 8031;

  await app.listen(port);
  logger.log(`🚀 Iverto Backend running on port ${port}`);
  logger.log(`📚 Swagger API Docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
