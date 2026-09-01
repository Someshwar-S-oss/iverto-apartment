export default () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // The hardcoded fallback secret is convenient for local dev but must never silently
  // back a production deployment — that would let anyone forge a superadmin JWT. Fail
  // fast at startup instead of shipping a guessable default.
  if (isProduction && !process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET must be set when NODE_ENV=production (refusing to start with the insecure default secret)',
    );
  }

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : '*';

  return {
    port: parseInt(process.env.PORT || '8031', 10),
    database: {
      url: process.env.DATABASE_URL || '',
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'iverto:gate:',
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev_secret_key_change_in_prod',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    },
    cors: {
      // Comma-separated allowlist (e.g. "https://app.iverto.com,https://admin.iverto.com").
      // Defaults to '*' — safe here because this API is Bearer-token authenticated, not
      // cookie-based, so `credentials: true` is never combined with it (see main.ts).
      origins: corsOrigins,
    },
    m50: {
      path: process.env.M50_WS_PATH || '/m50',
      cloudId: process.env.M50_CLOUD_ID || '',
    },
  };
};
