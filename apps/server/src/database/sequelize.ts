import { types } from 'pg';
import { Sequelize } from 'sequelize-typescript';
import { ALL_MODELS } from './models';

// DATE must stay a calendar string 'YYYY-MM-DD' — never a JS Date shifted by timezone.
types.setTypeParser(1082, (value: string) => value);

export function createSequelize(databaseUrl: string, opts: { poolMax?: number } = {}): Sequelize {
  return new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
    models: ALL_MODELS,
    pool: { max: opts.poolMax ?? 10, min: 0, idle: 10000, acquire: 20000 },
    dialectOptions: { application_name: 'renewaldesk', statement_timeout: 15000 },
    define: { underscored: true, timestamps: false },
  });
}
