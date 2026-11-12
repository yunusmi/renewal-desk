import { Controller, Get, Inject } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Sequelize } from 'sequelize-typescript';
import { ApiError } from './common/errors';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { SchemaMigration } from '../database/models';
import { Public } from './auth/principal';

// Works from src/api (ts-jest) and dist/api (runtime): two levels up is apps/server.
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'db', 'migrations');
const EXPECTED_MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js'));

/** Liveness and readiness. Readiness depends on DB + schema only, never on the provider. */
@ApiExcludeController()
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(Sequelize) private readonly sequelize: Sequelize) {}

  @Get()
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; database: string }> {
    try {
      await this.sequelize.authenticate();
      const applied = new Set((await SchemaMigration.findAll({ attributes: ['name'] })).map((m) => m.name));
      if (EXPECTED_MIGRATIONS.some((m) => !applied.has(m))) throw new Error('pending migrations');
    } catch {
      throw new ApiError(503, 'service_unavailable');
    }
    return { status: 'ready', database: 'ok' };
  }
}
