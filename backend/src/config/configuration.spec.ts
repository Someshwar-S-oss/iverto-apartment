import configuration from './configuration';

describe('Configuration', () => {
  it('should load default port and environment values', () => {
    process.env.PORT = '8031';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'supersecretjwtkey';

    const config = configuration();
    expect(config.port).toBe(8031);
    expect(config.database.url).toBe('postgres://user:pass@localhost:5432/testdb');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.jwt.secret).toBe('supersecretjwtkey');
  });
});
