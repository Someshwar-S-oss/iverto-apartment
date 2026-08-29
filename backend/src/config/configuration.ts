export default () => ({
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
  m50: {
    path: process.env.M50_WS_PATH || '/m50',
    cloudId: process.env.M50_CLOUD_ID || '',
  },
});
