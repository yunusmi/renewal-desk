import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { ApiConfig } from '../config/env';
import { pinoParams } from '../common/logging';
import { DatabaseModule } from './common/database.module';
import { API_CONFIG, SHARED_SEQUELIZE } from './common/tokens';
import type { Sequelize } from 'sequelize-typescript';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { RenewalsModule } from './renewals/renewals.module';

@Module({})
export class AppModule {
  static forRoot(cfg: ApiConfig, shared: Sequelize | null = null): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot(pinoParams(cfg.logLevel)),
        DatabaseModule,
        AuthModule,
        RenewalsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: API_CONFIG, useValue: cfg },
        { provide: SHARED_SEQUELIZE, useValue: shared },
      ],
      exports: [API_CONFIG, SHARED_SEQUELIZE],
    };
  }
}
