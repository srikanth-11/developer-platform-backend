import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

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
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        // autoLoadEntities lets each feature module register its own entities
        // via TypeOrmModule.forFeature([...]) without us maintaining a central
        // list here. Entities get picked up automatically.
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize'),
        logging: config.get<boolean>('database.logging'),
      }),
    }),
  ],
})
export class DatabaseModule {}
