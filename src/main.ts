// MUST be first: registers the global `crypto` on Node 18 before any module
// (TypeORM) that depends on it is loaded.
import './polyfills';

import { ValidationPipe, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  json,
  NextFunction,
  raw,
  Request,
  RequestHandler,
  Response,
  urlencoded,
} from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppModule } from './app.module';
import { DeveloperPortalService } from './developer-portal/developer-portal.service';
import { MonitoringService } from './monitoring/monitoring.service';

/**
 * Collapse high-cardinality path segments (uuids, numeric ids) into placeholders
 * so the Prometheus `route` label stays bounded — `/api/organizations/:id/...`
 * instead of a unique label per org.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeRoute(path: string): string {
  return (
    path
      .split('?')[0]
      .split('/')
      .map((seg) => (UUID_RE.test(seg) ? ':id' : /^\d+$/.test(seg) ? ':n' : seg))
      .join('/') || '/'
  );
}

async function bootstrap() {
  // Disable Nest's built-in body parser so we can install one with a SIZE LIMIT
  // (an unbounded parser is a DoS vector — a huge body could exhaust memory).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  // Helmet sets a suite of secure HTTP response headers (X-Content-Type-Options,
  // X-Frame-Options, Strict-Transport-Security, etc.) with sane defaults.
  app.use(helmet());

  // Body parsers WITH a size cap.
  const bodyLimit = config.get<string>('security.bodyLimit') ?? '1mb';
  const globalPrefix = config.get<string>('app.globalPrefix') ?? 'api';

  // The Stripe webhook needs the RAW request body for signature verification, so
  // we mount a raw parser for just that path and skip JSON/urlencoded for it.
  const webhookPath = `/${globalPrefix}/billing/webhook`;
  const skipWebhook =
    (parser: RequestHandler): RequestHandler =>
    (req, res, next) =>
      req.path === webhookPath ? next() : parser(req, res, next);

  app.use(webhookPath, raw({ type: '*/*' }));
  app.use(skipWebhook(json({ limit: bodyLimit })));
  app.use(skipWebhook(urlencoded({ extended: true, limit: bodyLimit })));

  // Consistent error shape + no internal leakage on unexpected errors.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Per-request Prometheus metrics. A plain Express middleware (installed via
  // app.use) reliably sees EVERY request — including 404s and errors — and
  // records on the response's `finish` event with the final status code.
  const monitoring = app.get(MonitoringService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') return next(); // don't measure the scrape
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      monitoring.observe(
        req.method,
        normalizeRoute(req.originalUrl),
        res.statusCode,
        durationSec,
      );
    });
    next();
  });

  // All routes are served under a common prefix, e.g. /api/health — EXCEPT
  // /metrics, which Prometheus expects at the root. (globalPrefix is declared
  // above, next to the body parsers, since the webhook raw-body path needs it.)
  app.setGlobalPrefix(globalPrefix, { exclude: ['metrics'] });

  // URI versioning: versioned controllers serve at /api/v1/…, /api/v2/….
  // defaultVersion VERSION_NEUTRAL means existing (unversioned) controllers keep
  // working at /api/… AND match any version — so nothing we built breaks.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });

  // A global ValidationPipe automatically validates incoming request bodies
  // against our DTO classes (using class-validator decorators).
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip any properties not declared in the DTO — prevents over-posting.
      whitelist: true,
      // Throw if unknown properties are sent, instead of silently dropping.
      forbidNonWhitelisted: true,
      // Auto-convert payloads to their DTO types (e.g. "5" -> 5).
      transform: true,
    }),
  );

  // ---- Developer Portal: OpenAPI docs + interactive playground ----
  // SwaggerModule introspects every controller/route (the @nestjs/swagger CLI
  // plugin auto-derives schemas from our DTOs). Served at /docs (UI) and
  // /docs-json (the raw OpenAPI spec). The spec is also handed to the portal
  // service so it can emit a Postman collection.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Developer Platform API')
    .setDescription('API Gateway & Developer Platform — see /developer-portal')
    .setVersion('1.0')
    .addBearerAuth() // JWT for dashboard routes
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, openApiDocument);
  app.get(DeveloperPortalService).setSpec(openApiDocument);

  // CORS restricted to configured origins ('*' allows any — dev default).
  const corsOrigins = config.get<string[]>('security.corsOrigins') ?? ['*'];
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`🚀 Backend running on http://localhost:${port}/${globalPrefix}`);
}
bootstrap();
