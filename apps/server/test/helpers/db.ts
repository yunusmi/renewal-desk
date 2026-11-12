import { Sequelize as SequelizeLib, type Model, type ModelStatic } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import {
  AuditEvent,
  AuthSession,
  DatasetMeta,
  RenewalJob,
  RenewalRequest,
  Resource,
  User,
  Workspace,
  WorkspaceMember,
} from '../../src/database/models';
import { createSequelize } from '../../src/database/sequelize';
import { assertTestDatabase, TEST_DATABASE_URL } from './env';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const coreSeeder = require('../../db/seeders/core/20261112000001-core-dataset.js');

export function testSequelize(): Sequelize {
  assertTestDatabase(TEST_DATABASE_URL);
  return createSequelize(TEST_DATABASE_URL, { poolMax: 30 });
}

/**
 * Explicit reset of the ISOLATED TEST database only, then the real core seeder
 * (marker kind "test"). TRUNCATE bypasses the append-only row trigger by design.
 */
export async function resetTestDb(sequelize: Sequelize): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  const meta = await DatasetMeta.findByPk('dataset_kind');
  if (meta && meta.value !== 'test') throw new Error(`refusing to reset dataset ${meta.value}`);
  const models = [
    AuditEvent,
    RenewalJob,
    RenewalRequest,
    AuthSession,
    Resource,
    WorkspaceMember,
    User,
    Workspace,
    DatasetMeta,
  ];
  for (const model of models as unknown as ModelStatic<Model>[]) {
    await model.truncate({ cascade: true, restartIdentity: true });
  }
  await sequelize.query('ALTER SEQUENCE renewal_request_seq RESTART WITH 1001');
  const prev = process.env.DATASET;
  process.env.DATASET = 'test';
  try {
    await coreSeeder.up(sequelize.getQueryInterface(), SequelizeLib);
  } finally {
    process.env.DATASET = prev;
  }
}
