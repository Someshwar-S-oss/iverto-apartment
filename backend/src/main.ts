import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { SharedHttpIoAdapter } from './common/adapters/shared-http-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
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

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 8031;

  await app.listen(port);
  logger.log(`Iverto Backend running on port ${port}`);
}

bootstrap();
