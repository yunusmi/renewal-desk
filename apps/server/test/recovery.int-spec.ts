import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { Sequelize } from 'sequelize-typescript';
import { AuditEvent, RenewalJob, RenewalRequest, Resource } from '../src/database/models';
import { Client, EMAILS, loggedIn } from './helpers/api';
import { resetTestDb, testSequelize } from './helpers/db';
import { testApiConfig, TEST_DATABASE_URL, TEST_ORIGIN } from './helpers/env';

async function port(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const p = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return p;
}
async function until<T>(fn: () => Promise<T | null | false>, timeout = 20000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Timed out waiting for persisted recovery condition');
}
async function kill(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}

test('R01 actual API + worker SIGKILL/restart preserves DB/provider and scheduled GET, date and operation once', async () => {
  let db: Sequelize | undefined;
  let api: ChildProcess | undefined;
  let worker: ChildProcess | undefined;
  let providerId: string | undefined;
  const apiPort = await port();
  const providerPort = await port();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const providerUrl = `http://127.0.0.1:${providerPort}`;
  const config = testApiConfig();
  const env = {
    ...process.env,
    APP_ENV: 'test',
    DATASET: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    APP_ORIGIN: TEST_ORIGIN,
    PORT: String(apiPort),
    JWT_SECRET: config.jwtSecret,
    CSRF_SECRET: config.csrfSecret,
    LOG_LEVEL: 'silent',
    PROVIDER_BASE_URL: providerUrl,
    PROVIDER_TIMEOUT_MS: '500',
    JOB_LEASE_MS: '4000',
    RETRY_DELAY_MS: '2500',
    WORKER_POLL_MS: '50',
  };
  const launchApi = () => spawn(process.execPath, ['dist/main-api.js'], { env, stdio: 'ignore' });
  const launchWorker = () =>
    spawn(process.execPath, ['dist/main-worker.js'], { env, stdio: 'ignore' });
  try {
    db = testSequelize();
    await resetTestDb(db);
    // Fresh dedicated container, unchanged simulator; keep it alive throughout API/worker kills.
    providerId = execFileSync(
      'docker',
      ['run', '-d', '--rm', '-p', `127.0.0.1:${providerPort}:8091`, 'renewaldesk-provider:local'],
      { encoding: 'utf8' },
    ).trim();
    await until(async () =>
      fetch(`${providerUrl}/health`)
        .then(async (r) => {
          await r.arrayBuffer();
          return r.ok;
        })
        .catch(() => false),
    );
    api = launchApi();
    await until(async () =>
      fetch(`${baseUrl}/health/ready`)
        .then(async (r) => {
          await r.arrayBuffer();
          return r.ok;
        })
        .catch(() => false),
    );
    const ini = await loggedIn(baseUrl, EMAILS.iniA);
    const apr = await loggedIn(baseUrl, EMAILS.aprA);
    const created = await ini.post('/resources/res-a-01/renewals', {});
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await apr.post(`/renewals/${id}/approve`, {})).status).toBe(200);
    worker = launchWorker();
    const uncertain = await until(async () => {
      const r = (await RenewalRequest.findByPk(id))!;
      const j = (await RenewalJob.findOne())!;
      return r.providerConfirmation === 'uncertain' && j.status === 'queued' ? { r, j } : null;
    });
    expect(uncertain.j.postAttempts).toBe(1);
    const scheduled = uncertain.j.nextRunAt.getTime();
    const operation = (await (
      await fetch(`${providerUrl}/renewals/${encodeURIComponent(uncertain.r.idempotencyKey)}`)
    ).json()) as { operation_id: string; started_count: number };
    expect(operation.started_count).toBe(1);
    const providerOriginalId = providerId;
    await Promise.all([kill(worker), kill(api)]);
    api = launchApi();
    worker = launchWorker();
    await until(async () =>
      fetch(`${baseUrl}/health/ready`)
        .then(async (r) => {
          await r.arrayBuffer();
          return r.ok;
        })
        .catch(() => false),
    );
    expect(providerId).toBe(providerOriginalId);
    expect(
      execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', providerId!], {
        encoding: 'utf8',
      }).trim(),
    ).toBe('true');
    await until(async () => (await RenewalRequest.findByPk(id))!.status === 'completed');
    const req = (await RenewalRequest.findByPk(id))!;
    const job = (await RenewalJob.findOne())!;
    expect(req.operationId).toBe(operation.operation_id);
    expect(job.postAttemptsTotal).toBe(1);
    expect(job.status).toBe('done');
    const confirmed = (await AuditEvent.findOne({ where: { type: 'provider_confirmed' } }))!;
    expect(confirmed.occurredAt.getTime()).toBeGreaterThanOrEqual(scheduled);
    expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
    const stats = await (await fetch(`${providerUrl}/stats?resource_id=res-a-01`)).json();
    expect(stats).toMatchObject({ operation_count: 1 });
    const after = await (
      await fetch(`${providerUrl}/renewals/${encodeURIComponent(req.idempotencyKey)}`)
    ).json();
    expect(after).toMatchObject({ operation_id: operation.operation_id, started_count: 1 });
    // Existing authenticated cookie remains usable across API restart.
    const existing = new Client(baseUrl);
    existing.cookie = ini.cookie;
    existing.csrf = ini.csrf;
    expect((await existing.get(`/renewals/${id}`)).body.request.status).toBe('completed');
    const rejected = await existing.post('/resources/res-a-02/renewals', {});
    expect((await apr.post(`/renewals/${rejected.body.id}/reject`, {})).status).toBe(200);
    expect(await (await fetch(`${providerUrl}/stats?resource_id=res-a-02`)).json()).toMatchObject({
      operation_count: 0,
    });
    await kill(worker);
    worker = launchWorker();
    await new Promise((r) => setTimeout(r, 250));
    expect((await Resource.findByPk('res-a-01'))!.expiresOn).toBe('2027-03-31');
    expect(await AuditEvent.count({ where: { type: 'term_updated' } })).toBe(1);
  } finally {
    await Promise.all([kill(worker), kill(api)]);
    if (providerId) execFileSync('docker', ['stop', providerId], { stdio: 'ignore' });
    await db?.close();
  }
});
