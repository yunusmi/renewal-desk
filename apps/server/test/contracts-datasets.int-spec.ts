import { execFileSync } from 'node:child_process';
import type { Sequelize } from 'sequelize-typescript';
import {
  AuditEvent,
  DatasetMeta,
  RenewalJob,
  RenewalRequest,
  Resource,
  User,
} from '../src/database/models';
import { EMAILS, loggedIn, startApi, type TestApi } from './helpers/api';
import { resetTestDb, testSequelize } from './helpers/db';
import { TEST_DATABASE_URL, TEST_PROVIDER_URL } from './helpers/env';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const demoSeeder = require('../db/seeders/demo/20261112000001-demo-dataset');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const coreSeeder = require('../db/seeders/core/20261112000001-core-dataset');
let db: Sequelize;
let api: TestApi;
beforeAll(async () => {
  db = testSequelize();
  api = await startApi(db);
});
beforeEach(async () => resetTestDb(db));
afterEach(async () => {
  await DatasetMeta.update({ value: 'test' }, { where: { key: 'dataset_kind' } });
});
afterAll(async () => {
  await api.close();
  await db.close();
});
function snake(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(snake);
    return;
  }
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      snake(child);
    }
}
test('C01 OpenAPI real paths, cookie, CSRF and local docs assets; recursive snake_case responses', async () => {
  const c = await loggedIn(api.baseUrl, EMAILS.iniA);
  const created = await c.post('/resources/res-a-01/renewals', {});
  for (const endpoint of [
    '/auth/me',
    '/overview',
    '/resources',
    '/resources/res-a-01',
    '/renewals',
    `/renewals/${created.body.id}`,
    '/audit-events',
  ]) {
    const response = await c.get(endpoint);
    expect(response.status).toBe(200);
    snake(response.body);
  }
  const spec = (await (await fetch(`${api.baseUrl}/docs/openapi.json`)).json()) as {
    paths: Record<string, unknown>;
    components: {
      securitySchemes: Record<string, unknown>;
      schemas: Record<string, { properties?: Record<string, unknown> }>;
    };
  };
  expect(spec.paths).toHaveProperty('/api/v1/renewals/{id}/approve');
  expect(spec.components.securitySchemes).toHaveProperty('session');
  for (const schema of Object.values(spec.components.schemas))
    for (const field of Object.keys(schema.properties ?? {}))
      expect(field).toMatch(/^[a-z][a-z0-9_]*$/);
  for (const route of [
    '/docs',
    '/docs/swagger',
    '/docs/assets/web-components.min.js',
    '/docs/assets/styles.min.css',
  ]) {
    const response = await fetch(api.baseUrl + route);
    await response.arrayBuffer();
    expect(response.status).toBe(200);
  }
  expect((await c.get('/resources?has_active=true')).body.total).toBe(1);
  expect((await c.get('/resources?has_active=false')).body.total).toBe(1);
  expect((await c.get('/renewals?q=Хранилище&limit=1')).body.total).toBe(1);
  expect((await c.get('/renewals?q=%25')).body.total).toBe(0);
});
test('D01 core re-seed preserves renewed dates; demo cannot be seeded over core/test', async () => {
  await Resource.update({ expiresOn: '2027-03-31' }, { where: { id: 'res-a-01' } });
  execFileSync('npx', ['--no-install', 'sequelize-cli', 'db:seed:all'], {
    env: { ...process.env, DATASET: 'test', DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
  await expect(demoSeeder.up(db.getQueryInterface())).rejects.toThrow('refusing to seed');
  expect(await Resource.count()).toBe(3);
});
test('D01 demo seed 15 resources / 7 users / 11 requests, coherent history and idempotent provider bootstrap', async () => {
  // Explicit isolated test DB fixture transition; never runs against a core/demo database.
  await DatasetMeta.destroy({ where: { key: 'dataset_kind' } });
  await demoSeeder.up(db.getQueryInterface());
  expect(await Resource.count()).toBe(15);
  expect(await User.count()).toBe(7);
  expect(await RenewalRequest.count()).toBe(11);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-01');
  expect((await Resource.findByPk('res-a-03'))!.expiresOn).toBe('2027-01-15');
  const second = (await RenewalRequest.findByPk('RN-0901'))!;
  expect(second.previousExpiresOn).toBe('2026-12-16');
  expect(second.newExpiresOn).toBe('2027-01-15');
  expect(await RenewalJob.count()).toBe(2);
  expect(
    await RenewalRequest.count({ where: { status: 'completed', fixtureOrigin: 'demo_history' } }),
  ).toBe(4);
  const count = await AuditEvent.count();
  await demoSeeder.up(db.getQueryInterface());
  expect(await AuditEvent.count()).toBe(count);
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    DATASET: 'demo',
    APP_ENV: 'test',
    PROVIDER_BASE_URL: TEST_PROVIDER_URL,
    LOG_LEVEL: 'silent',
  };
  for (let i = 0; i < 2; i++)
    execFileSync(process.execPath, ['dist/cli/demo-bootstrap.js'], { env, stdio: 'pipe' });
  const req = (await RenewalRequest.findByPk('RN-0903'))!;
  const operation = await (
    await fetch(`${TEST_PROVIDER_URL}/renewals/${encodeURIComponent(req.idempotencyKey)}`)
  ).json();
  expect(operation).toMatchObject({ started_count: 1, resource_id: 'res-a-06' });
  expect(req.status).toBe('requires_attention');
});

test('D01 expanded Core seed inserts 18 resources without overwriting existing resources, requests or jobs', async () => {
  const ini = await loggedIn(api.baseUrl, EMAILS.iniA);
  const apr = await loggedIn(api.baseUrl, EMAILS.aprA);
  const created = await ini.post('/resources/res-a-01/renewals', {});
  expect(created.status).toBe(201);
  expect((await apr.post(`/renewals/${created.body.id}/approve`, {})).status).toBe(200);
  await Resource.update(
    { expiresOn: '2027-03-02', amountMinor: 128001 },
    { where: { id: 'res-a-01' } },
  );
  const beforeRequests = (await RenewalRequest.findAll({ raw: true })).map((r) => ({ ...r }));
  const beforeJobs = (await RenewalJob.findAll({ raw: true })).map((j) => ({ ...j }));
  const beforeEvents = await AuditEvent.count();
  // Explicit isolated test fixture transition to exercise the actual DATASET=core path.
  await DatasetMeta.update({ value: 'core' }, { where: { key: 'dataset_kind' } });
  const previousDataset = process.env.DATASET;
  process.env.DATASET = 'core';
  try {
    await coreSeeder.up(db.getQueryInterface());
    await coreSeeder.up(db.getQueryInterface());
  } finally {
    if (previousDataset === undefined) delete process.env.DATASET;
    else process.env.DATASET = previousDataset;
  }
  expect(await Resource.count()).toBe(18);
  expect(await Resource.count({ where: { workspaceId: 'alpha' } })).toBe(15);
  expect(await Resource.count({ where: { workspaceId: 'beta' } })).toBe(3);
  expect(await User.count()).toBe(4);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-02');
  expect((await Resource.findByPk('res-a-01'))!.amountMinor).toBe(128001);
  expect((await Resource.findByPk('res-a-02'))!.expiresOn).toBe('2027-05-20');
  expect((await Resource.findByPk('res-b-01'))!.expiresOn).toBe('2027-06-01');
  expect(await RenewalRequest.findAll({ raw: true })).toEqual(beforeRequests);
  expect(await RenewalJob.findAll({ raw: true })).toEqual(beforeJobs);
  expect(await AuditEvent.count()).toBe(beforeEvents);
  const alpha = await ini.get('/resources?limit=100');
  expect(alpha.body.workspace_total).toBe(15);
  expect(alpha.body.items).toHaveLength(15);
  const beta = await loggedIn(api.baseUrl, EMAILS.iniB);
  expect((await beta.get('/resources')).body.workspace_total).toBe(3);
  expect((await beta.get('/resources/res-a-15')).status).toBe(403);
});
