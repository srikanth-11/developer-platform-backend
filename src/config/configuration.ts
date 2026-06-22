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
    // A full connection string (e.g. Neon) takes precedence over the discrete
    // DB_* vars below when set.
    url: process.env.DATABASE_URL || undefined,
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
    // AWS RDS (and most managed Postgres) require TLS. DB_SSL=true turns it on.
    // Provide the RDS CA so the server cert is actually VERIFIED — never disable
    // verification in production. Either inline PEM (DB_SSL_CA) or a path to a
    // PEM file baked into the image (DB_SSL_CA_FILE, used on ECS).
    ssl: process.env.DB_SSL === 'true',
    sslCa: process.env.DB_SSL_CA || undefined,
    sslCaFile: process.env.DB_SSL_CA_FILE || undefined,
  },
  redis: {
    // A full connection string (e.g. Render Key Value / Upstash) takes
    // precedence over the discrete REDIS_* vars. Use rediss:// for TLS.
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    // ElastiCache with an AUTH token / in-transit encryption needs these.
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
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
