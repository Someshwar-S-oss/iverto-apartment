import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService (in-memory fallback, no REDIS_URL configured)', () => {
  let service: IdempotencyService;

  beforeEach(async () => {
    const mockConfig = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    const originalRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    service = new IdempotencyService(mockConfig);
    await service.onModuleInit();

    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return null for a key that was never set', async () => {
    await expect(service.get('missing-key')).resolves.toBeNull();
  });

  it('should return a stored value before it expires', async () => {
    await service.set('key-1', { id: 'entry-1' }, 60);
    await expect(service.get('key-1')).resolves.toEqual({ id: 'entry-1' });
  });

  it('should return null once the TTL has elapsed', async () => {
    const realNow = Date.now;
    try {
      await service.set('key-2', { id: 'entry-2' }, 1);
      Date.now = () => realNow() + 2000;
      await expect(service.get('key-2')).resolves.toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
