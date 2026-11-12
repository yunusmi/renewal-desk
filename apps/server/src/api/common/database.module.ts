import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { API_CONFIG, SHARED_SEQUELIZE } from './tokens';
import type { ApiConfig } from '../../config/env';
import { createSequelize } from '../../database/sequelize';

@Global()
@Module({
  providers: [
    {
      provide: Sequelize,
      inject: [API_CONFIG, SHARED_SEQUELIZE],
      useFactory: (cfg: ApiConfig, shared: Sequelize | null) => shared ?? createSequelize(cfg.databaseUrl),
    },
  ],
  exports: [Sequelize],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(Sequelize) private readonly sequelize: Sequelize,
    @Inject(SHARED_SEQUELIZE) private readonly shared: Sequelize | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // A shared instance (tests) is owned and closed by its creator.
    if (!this.shared) await this.sequelize.close();
  }
}
