import type { Sequelize } from 'sequelize-typescript';
import { CommandsService } from '../src/api/renewals/commands.service';
import { AuditEvent, RenewalJob, RenewalRequest, Resource } from '../src/database/models';
import { EMAILS, loggedIn, startApi, type Client, type TestApi } from './helpers/api';
import { resetTestDb, testSequelize } from './helpers/db';

let sequelize: Sequelize;
let api: TestApi;
let ini: Client;
let apr: Client;
beforeAll(async () => {
  sequelize = testSequelize();
  api = await startApi(sequelize);
});
beforeEach(async () => {
  await resetTestDb(sequelize);
  [ini, apr] = await Promise.all([
    loggedIn(api.baseUrl, EMAILS.iniA),
    loggedIn(api.baseUrl, EMAILS.aprA),
  ]);
});
afterEach(() => {
  CommandsService.faultHook = null;
});
afterAll(async () => {
  await api.close();
  await sequelize.close();
});
const create = () => ini.post('/resources/res-a-01/renewals', {});

test('B01 snapshot and actor are server-owned; resource unchanged; no job', async () => {
  const r = await create();
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({
    id: 'RN-1001',
    status: 'pending_approval',
    previous_expires_on: '2027-03-01',
    new_expires_on: '2027-03-31',
    amount_minor: 128000,
    currency: 'RUB',
    created_by: 'u-ini-a',
  });
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-01');
  expect(await RenewalJob.count()).toBe(0);
  expect(await AuditEvent.count({ where: { type: 'request_created', actorId: 'u-ini-a' } })).toBe(
    1,
  );
});
test('B02 independent concurrent HTTP creates yield one 201 and one 409; DB index is final defense', async () => {
  const other = await loggedIn(api.baseUrl, EMAILS.iniA);
  const responses = await Promise.all([create(), other.post('/resources/res-a-01/renewals', {})]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect((await create()).body.error_code).toBe('active_renewal_exists');
  const row = (await RenewalRequest.findOne())!;
  await expect(
    RenewalRequest.create({ ...row.get(), id: 'RN-9999', idempotencyKey: 'unique-other-key' }),
  ).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  expect(await RenewalRequest.count()).toBe(1);
});
test.each(['approve', 'reject'])(
  'B03 concurrent approve/%s commits exactly one decision',
  async (action) => {
    const r = await create();
    const other = await loggedIn(api.baseUrl, EMAILS.aprA);
    const responses = await Promise.all([
      apr.post(`/renewals/${r.body.id}/approve`, {}),
      other.post(`/renewals/${r.body.id}/${action}`, {}),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await AuditEvent.count({ where: { type: ['request_approved', 'request_rejected'] } }),
    ).toBe(1);
    expect(await RenewalJob.count()).toBe(
      (await RenewalRequest.findByPk(r.body.id))!.status === 'processing' ? 1 : 0,
    );
  },
);
test.each([{ expiresOn: '2027-03-02' }, { amountMinor: 128001 }])(
  'B04 changed snapshot returns 409 without enqueue: %j',
  async (change) => {
    const r = await create();
    await Resource.update(change, { where: { id: 'res-a-01' } });
    expect((await apr.post(`/renewals/${r.body.id}/approve`, {})).body.error_code).toBe(
      'resource_changed',
    );
    expect((await RenewalRequest.findByPk(r.body.id))!.status).toBe('pending_approval');
    expect(await RenewalJob.count()).toBe(0);
  },
);
test.each(['approve:after_job', 'approve:after_audit'])(
  'B04 injected failure at %s rolls back approval, job and audit',
  async (point) => {
    const r = await create();
    CommandsService.faultHook = (p) => {
      if (p === point) throw new Error('test rollback');
    };
    expect((await apr.post(`/renewals/${r.body.id}/approve`, {})).status).toBe(500);
    expect((await RenewalRequest.findByPk(r.body.id))!.status).toBe('pending_approval');
    expect(await RenewalJob.count()).toBe(0);
    expect(await AuditEvent.count()).toBe(1);
  },
);
test('B05 rejection leaves date and provider queue unchanged; permits next renewal', async () => {
  const r = await create();
  expect((await apr.post(`/renewals/${r.body.id}/reject`, {})).body.status).toBe('rejected');
  expect((await apr.post(`/renewals/${r.body.id}/reject`, {})).status).toBe(409);
  expect(await RenewalJob.count()).toBe(0);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-01');
  expect((await create()).status).toBe(201);
});
