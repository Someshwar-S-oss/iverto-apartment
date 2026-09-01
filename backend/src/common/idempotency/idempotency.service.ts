import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Stores `(key) -> response` for the idempotency interceptor. Redis-backed when
 * configured (works across app instances, survives restarts — required for the "same
 * key after a timeout, possibly against a different instance" scenario this exists
 * for), same graceful in-memory fallback as RbacService's permission cache when it
 * isn't.
 */
@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);
  private redisClient: Redis | null = null;
  private readonly memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      const redisUrl = this.config.get<string>('redis.url') || process.env.REDIS_URL;
      const keyPrefix = this.config.get<string>('redis.keyPrefix') || process.env.REDIS_KEY_PREFIX || 'iverto:gate:';
      if (redisUrl) {
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          keyPrefix,
          retryStrategy: () => null,
        });

        this.redisClient.on('error', (err) => {
          this.logger.debug(`Redis connection error (fallback to in-memory cache): ${err.message}`);
        });

        await this.redisClient.connect().catch((err) => {
          this.logger.debug(`Redis connect failed (fallback to in-memory cache): ${err.message}`);
        });
      }
    } catch (err: any) {
      this.logger.debug(`Redis initialization skipped: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        this.redisClient.disconnect(false);
      } catch {
        // ignore cleanup error
      }
      this.redisClient = null;
    }
    this.memoryCache.clear();
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const cached = await this.redisClient.get(key);
        return cached ? (JSON.parse(cached) as T) : null;
      } catch (err: any) {
        this.logger.debug(`Redis read error: ${err.message}`);
      }
    }

    const entry = this.memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as T;
    }
    if (entry) {
      this.memoryCache.delete(key);
    }
    return null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch (err: any) {
        this.logger.debug(`Redis write error: ${err.message}`);
      }
    }

    this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
