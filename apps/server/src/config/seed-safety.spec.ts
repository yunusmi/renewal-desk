import { loadDbConfig } from './env';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertFictionalSeedEnvironment } = require('../../db/data/seed-helpers');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const coreSeeder = require('../../db/seeders/core/20261112000001-core-dataset');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const demoSeeder = require('../../db/seeders/demo/20261112000001-demo-dataset');

test.each(['core', 'demo', 'test'])('production runtime rejects bundled %s dataset', (dataset) => {
  expect(() =>
    loadDbConfig({
      APP_ENV: 'production',
      DATASET: dataset,
      DATABASE_URL: 'postgresql://unused/db',
    }),
  ).toThrow('cannot run in production');
});
test.each(['development', 'test'])(
  'explicit %s seed mode permits local Docker NODE_ENV=production',
  (appEnv) => {
    expect(() =>
      assertFictionalSeedEnvironment({ APP_ENV: appEnv, NODE_ENV: 'production' }),
    ).not.toThrow();
  },
);
test.each([undefined, '', 'production', 'staging'])(
  'unsafe/missing APP_ENV=%s rejects fictional seeds',
  (appEnv) => {
    expect(() => assertFictionalSeedEnvironment({ APP_ENV: appEnv })).toThrow(
      'production seeding is forbidden',
    );
  },
);
test.each([
  ['core', coreSeeder],
  ['demo', demoSeeder],
])('%s seeder refuses production before database access', async (_name, seeder) => {
  const previous = process.env.APP_ENV;
  const transaction = jest.fn();
  process.env.APP_ENV = 'production';
  try {
    await expect(seeder.up({ sequelize: { transaction } })).rejects.toThrow(
      'production seeding is forbidden',
    );
    expect(transaction).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});
