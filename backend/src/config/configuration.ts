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

  // Path segment this instance is namespaced under when it sits behind a shared reverse
  // proxy (Caddy) alongside other Nest apps on the same host, e.g. "gate" so this app
  // owns everything under /gate/* while a sibling app owns /other/*. Strip any leading
  // /trailing slashes the operator may have included so it composes cleanly below.
  // Empty by default — local dev and single-app deployments are unaffected.
  const apiPrefix = (process.env.API_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const m50Path = process.env.M50_WS_PATH || '/m50';

  return {
    port: parseInt(process.env.PORT || '8031', 10),
    apiPrefix,
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
    razorpay: {
      // Left blank until real (even free test-mode) Razorpay keys are provisioned — see
      // payments.service.ts, which checks for these and returns a clear "not configured"
      // error instead of calling the SDK with an empty key.
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
    m50: {
      // The M50 raw WebSocket upgrade handler runs outside Nest's HTTP router (see
      // SharedHttpIoAdapter), so setGlobalPrefix in main.ts never touches it — the prefix
      // has to be folded into the path by hand so Caddy can still route the terminals'
      // upgrade requests to this app by the same /API_PREFIX/* rule as everything else.
      path: apiPrefix ? `/${apiPrefix}${m50Path}` : m50Path,
      cloudId: process.env.M50_CLOUD_ID || '',
    },
  };
};
