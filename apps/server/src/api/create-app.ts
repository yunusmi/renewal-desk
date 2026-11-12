import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Sequelize } from 'sequelize-typescript';
import type { ApiConfig } from '../config/env';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors';
import { setupDocs } from './docs';

export const API_PREFIX = 'api/v1';

/** Builds the configured API application (used by main-api and integration tests). */
export async function createApp(
  cfg: ApiConfig,
  opts: { sequelize?: Sequelize; logger?: false } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(cfg, opts.sequelize ?? null),
    {
      bufferLogs: true,
      bodyParser: false,
    },
  );
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '16kb' });
  app.use(cookieParser());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  setupDocs(app);
  app.enableShutdownHooks();
  return app;
}
