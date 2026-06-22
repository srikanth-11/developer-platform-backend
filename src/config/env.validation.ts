import * as Joi from 'joi';

/**
 * Environment-variable validation schema.
 *
 * The app should FAIL FAST at startup if a required variable is missing or
 * malformed — much better than crashing later with a confusing error deep in a
 * database call. NestJS's ConfigModule runs this Joi schema against
 * `process.env` the moment the app boots.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  GLOBAL_PREFIX: Joi.string().default('api'),

  // Database. A full DATABASE_URL (Neon etc.) makes the discrete DB_* optional.
  DATABASE_URL: Joi.string().uri().optional(),
  DB_HOST: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_PASSWORD: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_NAME: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  // TLS for managed Postgres (AWS RDS). DB_SSL_CA holds the RDS CA bundle (PEM)
  // so the certificate is verified, not blindly trusted.
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_CA: Joi.string().allow('').optional(),

  // Redis. A full REDIS_URL (Render Key Value / Upstash) makes REDIS_HOST optional.
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  REDIS_PORT: Joi.number().default(6379),
  // ElastiCache AUTH token + in-transit encryption (optional).
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TLS: Joi.boolean().default(false),

  // JWT
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  // Security
  CORS_ORIGINS: Joi.string().default('*'),
  AUTH_THROTTLE_TTL_MS: Joi.number().default(60000),
  AUTH_THROTTLE_LIMIT: Joi.number().default(15),
  BODY_LIMIT: Joi.string().default('1mb'),

  // Frontend URL for Stripe Checkout return links.
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  // Stripe (optional — billing falls back to metering-only if unset).
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
});
