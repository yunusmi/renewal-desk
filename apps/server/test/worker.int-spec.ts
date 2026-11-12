import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { Sequelize } from 'sequelize-typescript';
import { AuditEvent, RenewalJob, RenewalRequest, Resource } from '../src/database/models';
import { Jobs, type Claim } from '../src/worker/jobs';
import { ProviderClient, type Confirmation } from '../src/worker/provider';
import { EMAILS, loggedIn, startApi, type Client, type TestApi } from './helpers/api';
import { resetTestDb, testSequelize } from './helpers/db';
import { testWorkerConfig, TEST_PROVIDER_URL } from './helpers/env';

let db: Sequelize;
let api: TestApi;
let ini: Client;
let apr: Client;
let jobs: Jobs;
const cfg = testWorkerConfig({ retryDelayMs: 0 });
beforeAll(async () => {
  db = testSequelize();
  api = await startApi(db);
});
beforeEach(async () => {
  await resetTestDb(db);
  jobs = new Jobs(db, cfg);
  [ini, apr] = await Promise.all([
    loggedIn(api.baseUrl, EMAILS.iniA),
    loggedIn(api.baseUrl, EMAILS.aprA),
  ]);
});
afterAll(async () => {
  await api.close();
  await db.close();
});
async function approve() {
  const created = await ini.post('/resources/res-a-01/renewals', {});
  expect((await apr.post(`/renewals/${created.body.id}/approve`, {})).status).toBe(200);
  return (await RenewalRequest.findByPk(created.body.id))!;
}
async function step(client = new ProviderClient(cfg)) {
  const claim = await jobs.claim();
  expect(claim).not.toBeNull();
  const p = await jobs.prepare(claim!);
  expect(p).not.toBeNull();
  const result = await client.call(p!.method, p!.req.idempotencyKey, p!.job);
  await jobs.record(claim!, p!.method, result);
  return { claim: claim!, prepared: p!, result };
}
function evidence(): Confirmation {
  return {
    operation_id: randomUUID(),
    status: 'completed',
    started_count: 1,
    resource_id: 'res-a-01',
    period_months: 1,
    amount_minor: 128000,
    currency: 'RUB',
  };
}
async function expired() {
  await RenewalJob.update({ leaseUntil: new Date(0) }, { where: { status: 'leased' } });
}

test('R01 real simulator 503 then GET: stable key, one operation and one date effect', async () => {
  const before = (await (
    await fetch(`${TEST_PROVIDER_URL}/stats?resource_id=res-a-01`)
  ).json()) as { operation_count: number };
  const req = await approve();
  const first = await step();
  expect(first.result).toEqual({ kind: 'transient', code: 'provider_http_503' });
  expect((await req.reload()).providerConfirmation).toBe('uncertain');
  const second = await step();
  expect(second.prepared.method).toBe('GET');
  expect((await req.reload()).status).toBe('completed');
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
  const op = await (
    await fetch(`${TEST_PROVIDER_URL}/renewals/${encodeURIComponent(req.idempotencyKey)}`)
  ).json();
  expect(op).toMatchObject({ started_count: 1, operation_id: req.operationId });
  const after = (await (await fetch(`${TEST_PROVIDER_URL}/stats?resource_id=res-a-01`)).json()) as {
    operation_count: number;
  };
  expect(after.operation_count - before.operation_count).toBe(1);
  await jobs.record(second.claim, 'GET', second.result);
  expect(await AuditEvent.count({ where: { type: 'term_updated' } })).toBe(1);
  expect(await jobs.claim()).toBeNull();
});
test('R02 crash after reservation before send reconciles GET before next POST', async () => {
  await approve();
  const claim = (await jobs.claim())!;
  expect((await jobs.prepare(claim))!.method).toBe('POST');
  await expired();
  const recovered = (await jobs.claim())!;
  expect((await jobs.prepare(recovered))!.method).toBe('GET');
  await jobs.record(recovered, 'GET', { kind: 'transient', code: 'provider_http_404' });
  expect((await RenewalJob.findOne())!.postAttempts).toBe(1);
  expect((await jobs.prepare((await jobs.claim())!))!.method).toBe('POST');
});
test('R03 concurrent SKIP LOCKED claims and stale fencing block writes and audit', async () => {
  await approve();
  const claims = await Promise.all([jobs.claim(), jobs.claim()]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const stale = claims.find(Boolean) as Claim;
  await jobs.prepare(stale);
  await expired();
  const fresh = (await jobs.claim())!;
  expect(BigInt(fresh.token)).toBeGreaterThan(BigInt(stale.token));
  const count = await AuditEvent.count();
  await jobs.record(stale, 'POST', { kind: 'confirmed', confirmation: evidence() });
  expect(await AuditEvent.count()).toBe(count);
  expect((await RenewalRequest.findOne())!.status).toBe('processing');
  await jobs.record(fresh, 'GET', { kind: 'confirmed', confirmation: evidence() });
  expect((await RenewalRequest.findOne())!.status).toBe('completed');
});
test('R04 three POST reservations + final GET; concurrent retry reuses job/key and preserves total', async () => {
  const req = await approve();
  for (let i = 0; i < 6; i++) {
    const c = (await jobs.claim())!;
    const p = (await jobs.prepare(c))!;
    expect(p.method).toBe(i % 2 ? 'GET' : 'POST');
    await jobs.record(c, p.method, { kind: 'transient', code: 'provider_http_503' });
  }
  expect((await req.reload()).status).toBe('requires_attention');
  const original = (await RenewalJob.findOne())!;
  expect(original.postAttempts).toBe(3);
  expect(original.checkAttempts).toBe(3);
  expect((await ini.post('/resources/res-a-01/renewals', {})).status).toBe(409);
  const responses = await Promise.all([
    apr.post(`/renewals/${req.id}/retry`, {}),
    apr.post(`/renewals/${req.id}/retry`, {}),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const retry = (await RenewalJob.findOne())!;
  expect(retry.id).toBe(original.id);
  expect(retry.postAttempts).toBe(0);
  expect(retry.postAttemptsTotal).toBe(3);
  expect((await req.reload()).idempotencyKey).toBe(req.idempotencyKey);
  expect((await jobs.prepare((await jobs.claim())!))!.method).toBe('GET');
});
test('R05 invalid 200 never confirms and 409 is permanent', async () => {
  let server: Server | undefined;
  try {
    server = createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...evidence(), amount_minor: '128000' }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const client = new ProviderClient({
      ...cfg,
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    });
    const req = await approve();
    expect((await step(client)).result).toEqual({
      kind: 'permanent',
      code: 'provider_invalid_response',
    });
    expect((await req.reload()).status).toBe('requires_attention');
    expect(req.operationId).toBeNull();
  } finally {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }
});
test('R06 confirmed local mismatch retains evidence; retry cannot POST if GET loses evidence', async () => {
  const req = await approve();
  const c = (await jobs.claim())!;
  await jobs.prepare(c);
  await Resource.update({ expiresOn: '2027-03-02' }, { where: { id: 'res-a-01' } });
  const confirmation = evidence();
  await jobs.record(c, 'POST', { kind: 'confirmed', confirmation });
  expect((await req.reload()).status).toBe('requires_attention');
  expect(req.providerConfirmation).toBe('confirmed');
  expect(req.operationId).toBe(confirmation.operation_id);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-02');
  await apr.post(`/renewals/${req.id}/retry`, {});
  const c2 = (await jobs.claim())!;
  expect((await jobs.prepare(c2))!.method).toBe('GET');
  await jobs.record(c2, 'GET', { kind: 'transient', code: 'provider_http_404' });
  expect((await req.reload()).providerConfirmation).toBe('confirmed');
  expect(req.status).toBe('requires_attention');
  expect((await RenewalJob.findOne())!.postAttemptsTotal).toBe(1);
});
test('R07 persisted schedule prevents early reclaim, including expired lease', async () => {
  await approve();
  jobs = new Jobs(db, { ...cfg, retryDelayMs: 60000 });
  const c = (await jobs.claim())!;
  await jobs.prepare(c);
  await expired();
  expect(await jobs.claim()).toBeNull();
});

test('R04 real fault HTTP service exhausts exactly three POST sends; same-key manual retry completes one effect', async () => {
  let available = false;
  let posts = 0;
  let checks = 0;
  const operations = new Map<string, Confirmation>();
  const payloads: string[] = [];
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST') {
      posts++;
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      payloads.push(Buffer.concat(parts).toString());
      const key = String(req.headers['idempotency-key']);
      if (!available) {
        send(503, { error: 'test_outage' });
        return;
      }
      if (!operations.has(key)) operations.set(key, evidence());
      send(200, operations.get(key));
    } else {
      checks++;
      const key = decodeURIComponent(req.url!.slice('/renewals/'.length));
      send(operations.has(key) ? 200 : 404, operations.get(key) ?? { error: 'not_found' });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = new ProviderClient({
      ...cfg,
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    });
    const req = await approve();
    const jobId = (await RenewalJob.findOne())!.id;
    for (let i = 0; i < 6; i++) await step(client);
    expect(posts).toBe(3);
    expect(checks).toBe(3);
    expect((await req.reload()).status).toBe('requires_attention');
    const key = req.idempotencyKey;
    available = true;
    expect((await apr.post(`/renewals/${req.id}/retry`, {})).status).toBe(200);
    const check = await step(client);
    expect(check.prepared.method).toBe('GET');
    expect(posts).toBe(3);
    await step(client);
    expect((await req.reload()).status).toBe('completed');
    expect(req.idempotencyKey).toBe(key);
    expect((await RenewalJob.findOne())!.id).toBe(jobId);
    expect((await RenewalJob.findOne())!.postAttemptsTotal).toBe(4);
    expect(operations.size).toBe(1);
    expect(new Set(payloads).size).toBe(1);
    expect([...operations.keys()]).toEqual([key]);
    expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
    expect(await AuditEvent.count({ where: { type: 'term_updated' } })).toBe(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('R06 audit database failure rolls back entire finalization; lease recovery completes exactly once', async () => {
  const req = await approve();
  const c = (await jobs.claim())!;
  await jobs.prepare(c);
  const before = await AuditEvent.count();
  const confirmation = evidence();
  // Test-only DB constraint fault: hook rejects the audit insertion after date/status/job writes.
  AuditEvent.addHook('beforeCreate', 'test-finalize-fault', (event: AuditEvent) => {
    if (event.type === 'term_updated') throw new Error('Injected finalization audit failure');
  });
  try {
    await expect(jobs.record(c, 'POST', { kind: 'confirmed', confirmation })).rejects.toThrow(
      'Injected finalization',
    );
  } finally {
    AuditEvent.removeHook('beforeCreate', 'test-finalize-fault');
  }
  expect((await req.reload()).status).toBe('processing');
  expect(req.operationId).toBeNull();
  expect(req.providerConfirmation).toBe('uncertain');
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-01');
  expect((await RenewalJob.findOne())!.status).toBe('leased');
  expect(await AuditEvent.count()).toBe(before);
  await expired();
  const recovery = (await jobs.claim())!;
  expect((await jobs.prepare(recovery))!.method).toBe('GET');
  await jobs.record(recovery, 'GET', { kind: 'confirmed', confirmation });
  await jobs.record(recovery, 'GET', { kind: 'confirmed', confirmation });
  expect((await req.reload()).status).toBe('completed');
  expect(req.operationId).toBe(confirmation.operation_id);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
  expect(await AuditEvent.count({ where: { type: 'term_updated' } })).toBe(1);
});

test('R02 provider effect before response persistence recovers through leased check without another POST', async () => {
  const req = await approve();
  const claim = (await jobs.claim())!;
  const prepared = (await jobs.prepare(claim))!;
  const client = new ProviderClient(cfg);
  const lost = await client.call('POST', req.idempotencyKey, prepared.job);
  expect(lost).toEqual({ kind: 'transient', code: 'provider_http_503' });
  // Simulate loss of all process memory before recording the external response.
  await expired();
  jobs = new Jobs(db, cfg);
  const recovery = await step(client);
  expect(recovery.prepared.method).toBe('GET');
  expect((await req.reload()).status).toBe('completed');
  expect((await RenewalJob.findOne())!.postAttemptsTotal).toBe(1);
  expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
});

test('R05 original simulator same encoded key/payload returns same operation; changed payload 409', async () => {
  const key = `protocol:/${randomUUID()}?query#fragment`;
  const protocolResource = `protocol-fixture-${randomUUID()}`;
  const payload = {
    resource_id: protocolResource,
    period_months: 1,
    amount_minor: 128000,
    currency: 'RUB',
  };
  const post = (body: unknown) =>
    fetch(`${TEST_PROVIDER_URL}/renewals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
  const first = await post(payload);
  await first.arrayBuffer();
  expect(first.status).toBe(503);
  const repeated = await post(payload);
  expect(repeated.status).toBe(200);
  const operation = (await repeated.json()) as Confirmation;
  const check = await (
    await fetch(`${TEST_PROVIDER_URL}/renewals/${encodeURIComponent(key)}`)
  ).json();
  expect(check).toMatchObject({ operation_id: operation.operation_id, started_count: 1 });
  const conflicting = await post({ ...payload, amount_minor: 128001 });
  await conflicting.arrayBuffer();
  expect(conflicting.status).toBe(409);
  const stats = (await (
    await fetch(`${TEST_PROVIDER_URL}/stats?resource_id=${protocolResource}`)
  ).json()) as { operation_count: number };
  expect(stats.operation_count).toBe(1);
});

test('R05 real HTTP timeout is uncertain and never confirmation', async () => {
  const server = createServer(() => {
    /* Deliberately no response, test-only timeout injection. */
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const req = await approve();
    const prepared = (await jobs.prepare((await jobs.claim())!))!;
    const client = new ProviderClient({
      ...cfg,
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      providerTimeoutMs: 100,
    });
    expect(await client.call('POST', req.idempotencyKey, prepared.job)).toEqual({
      kind: 'transient',
      code: 'provider_unavailable',
    });
    expect((await req.reload()).status).toBe('processing');
    expect(req.operationId).toBeNull();
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
});
