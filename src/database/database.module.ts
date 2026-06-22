import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/** Resolve the Postgres CA: inline PEM, or a PEM file path baked into the image. */
function resolveDbCa(config: ConfigService): string | undefined {
  const inline = config.get<string>('database.sslCa');
  if (inline) return inline;
  const file = config.get<string>('database.sslCaFile');
  return file ? readFileSync(file, 'utf8') : undefined;
}

/**
 * DatabaseModule wires TypeORM to PostgreSQL.
 *
 * We use `forRootAsync` (not `forRoot`) because the connection details live in
 * configuration, which is itself loaded asynchronously. `inject: [ConfigService]`
 * hands us the validated config so we never hard-code credentials here.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // Prefer a single connection string (Neon etc.) when provided; fall back
        // to the discrete host/port/credentials for local dev.
        ...(config.get<string>('database.url')
          ? { url: config.get<string>('database.url') }
          : {
              host: config.get<string>('database.host'),
              port: config.get<number>('database.port'),
              username: config.get<string>('database.username'),
              password: config.get<string>('database.password'),
              database: config.get<string>('database.name'),
            }),
        // autoLoadEntities lets each feature module register its own entities
        // via TypeOrmModule.forFeature([...]) without us maintaining a central
        // list here. Entities get picked up automatically.
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize'),
        logging: config.get<boolean>('database.logging'),
        // TLS for managed Postgres (e.g. AWS RDS). When a CA bundle is supplied
        // we VERIFY the server certificate against it (rejectUnauthorized:true).
        // RDS's CA isn't in Node's default trust store, so the bundle is required
        // to keep verification on — download it from the AWS RDS docs.
        ssl: config.get<boolean>('database.ssl')
          ? { ca: resolveDbCa(config), rejectUnauthorized: true }
          : false,
      }),
    }),
  ],
})
export class DatabaseModule {}
