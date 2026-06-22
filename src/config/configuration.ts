/**
 * Central configuration factory.
 *
 * Instead of reading `process.env.X` scattered across the codebase, we read all
 * environment variables ONCE here and shape them into a typed, nested object.
 * Every other module then injects `ConfigService` and asks for `app.port`,
 * `database.host`, etc. — clean, typed, and testable.
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    // Every route will be prefixed with this (e.g. /api/v1/...). Set in Step 1,
    // used heavily once we add API versioning in Phase 6.
    globalPrefix: process.env.GLOBAL_PREFIX ?? 'api',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'devplatform',
    // `synchronize` auto-creates tables from entities. Great for early learning,
    // but DANGEROUS in production (can drop columns). We keep it on only in dev
    // and will switch to real migrations in a later step.
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    // Secret used to SIGN and VERIFY access tokens. Must be long & random in
    // production. Anyone who knows it can forge valid tokens.
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    // How long an access token stays valid (e.g. 15m, 1h, 7d).
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  security: {
    // Allowed CORS origins (comma-separated). '*' = any (dev only).
    corsOrigins: (process.env.CORS_ORIGINS ?? '*')
      .split(',')
      .map((s) => s.trim()),
    // Brute-force throttle for auth endpoints.
    authThrottleTtlMs: parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10),
    authThrottleLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '15', 10),
    // Max request body size.
    bodyLimit: process.env.BODY_LIMIT ?? '1mb',
  },
  // Where the dashboard lives — used to build Stripe Checkout return URLs.
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  stripe: {
    // All OPTIONAL: if the secret key is absent, billing runs in the original
    // "metering only, no charges" mode and the Stripe endpoints report 501.
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  },
});
