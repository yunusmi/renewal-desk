import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertTestDatabase, TEST_DATABASE_URL } from './env';

/** Applies migrations to the isolated test DB with the real sequelize-cli. */
export default async function globalSetup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  execFileSync('npx', ['--no-install', 'sequelize-cli', 'db:migrate'], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DATASET: 'test' },
    stdio: 'pipe',
  });
}
