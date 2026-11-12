// Runs only against a fresh, explicitly isolated release-verification Compose project.
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const project = process.env.RELEASE_PROJECT;
const envFile = process.env.RELEASE_ENV_FILE;
if (!project?.startsWith('renewaldesk-release-') || !envFile) throw Error('Isolated RELEASE_PROJECT and RELEASE_ENV_FILE required');
const origin = process.env.RELEASE_WEB_URL || 'http://localhost:18082';
const provider = process.env.RELEASE_PROVIDER_URL || 'http://localhost:18094';
const output = path.resolve('artifacts/release');
mkdirSync(output, { recursive: true });
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const compose = (...args) => docker('compose', '--env-file', envFile, '-p', project, '-f', 'compose.yaml', '-f', 'compose.release.yaml', ...args);
const id = service => compose('ps', '-q', service);
const inspect = container => JSON.parse(docker('inspect', container))[0];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(200); }
  throw Error('Timed out: ' + label);
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body, headers: response.headers };
}
async function ready() {
  return wait(async () => { try { return (await request(origin + '/health/ready')).status === 200; } catch { return false; } }, 'Nginx API readiness');
}
async function login(email) {
  const response = await request(origin + '/api/v1/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'demo1234' }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = (await request(origin + '/api/v1/auth/csrf', { headers: { Cookie: cookie } })).body.csrf_token;
  return async (route, body) => request(origin + '/api/v1' + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function screenshots(requestId) {
  const { chromium } = require('@playwright/test');
  const options = process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: path.resolve('apps/web/e2e/chrome-wrapper.sh') } : {};
  const browser = await chromium.launch(options);
  const directory = path.join(output, 'screenshots'); mkdirSync(directory, { recursive: true });
  try {
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      try {
        const page = await context.newPage();
        await page.goto(origin + '/login');
        await page.getByLabel('Email', { exact: true }).fill('approver.alpha@renewaldesk.test');
        await page.getByLabel('Пароль', { exact: true }).fill('demo1234');
        await page.getByRole('button', { name: 'Войти', exact: true }).click();
        await page.getByRole('heading', { name: 'Обзор', exact: true }).waitFor();
        for (const [route, file] of [['/overview', 'overview'], ['/requests', 'requests'], ['/requests/' + requestId, 'completed']]) {
          await page.goto(origin + route);
          if (file === 'overview') await page.getByRole('heading', { name: 'Последние заявки', exact: true }).waitFor();
          else if (file === 'requests') await page.getByRole('link', { name: 'Хранилище A', exact: true }).waitFor();
          else await page.getByText('Провайдер подтвердил операцию. Срок ресурса обновлён.', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
          await page.screenshot({ path: path.join(directory, `${name}-${file}.png`), fullPage: true });
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
async function main() {
  await ready();
  const webBefore = inspect(id('web')); const providerBefore = inspect(id('provider')); const dbBefore = inspect(id('postgres'));
  const apiBefore = inspect(id('api'));
  const network = Object.keys(apiBefore.NetworkSettings.Networks)[0];
  const oldIp = apiBefore.NetworkSettings.Networks[network].IPAddress;
  const holder = project + '-ip-holder';
  let newIp;
  try {
    compose('rm', '-s', '-f', 'api');
    docker('run', '-d', '--name', holder, '--network', network, '--ip', oldIp, '--entrypoint', 'node', 'renewaldesk-server:local', '-e', 'setTimeout(()=>{},120000)');
    compose('up', '-d', '--no-deps', 'api');
    newIp = inspect(id('api')).NetworkSettings.Networks[network].IPAddress;
    assert.notEqual(newIp, oldIp, 'API IP must actually change');
    await ready();
    const webAfter = inspect(id('web'));
    assert.equal(webAfter.Id, webBefore.Id, 'Nginx container must not be recreated');
    assert.equal(webAfter.State.StartedAt, webBefore.State.StartedAt, 'Nginx process must not restart during DNS recovery');
    for (const route of ['/api/v1/auth/me', '/docs/openapi.json', '/docs/swagger', '/docs/assets/styles.min.css']) {
      assert.equal((await request(origin + route)).status, route.endsWith('/auth/me') ? 401 : 200, route);
    }
  } finally { try { docker('rm', '-f', holder); } catch { /* already removed */ } }
  console.log('PASS Nginx API recreation with changed IP and unchanged web container');
  // Both seeders must refuse known credentials in production before touching this DB.
  for (const dataset of ['core', 'demo']) {
    let rejected = false;
    try { compose('run', '--rm', '--no-deps', '-e', 'APP_ENV=production', '-e', `DATASET=${dataset}`, 'seed'); }
    catch (err) { rejected = String(err.stdout).includes('production seeding is forbidden') || String(err.stderr).includes('production seeding is forbidden'); }
    assert.equal(rejected, true, `${dataset} production seeder must refuse`);
  }
  const ini = await login('initiator.alpha@renewaldesk.test');
  const apr = await login('approver.alpha@renewaldesk.test');
  assert.equal((await ini('/renewals')).body.total, 0, 'Fresh DB required');
  assert.equal((await request(provider + '/stats?resource_id=res-a-01')).body.operation_count, 0, 'Fresh provider required');
  assert.equal((await ini('/resources/res-a-01')).body.resource.expires_on, '2027-03-01');
  compose('stop', 'worker');
  const created = await ini('/resources/res-a-01/renewals', {}); assert.equal(created.status, 201);
  const renewal = created.body; const key = renewal.idempotency_key;
  assert.equal((await ini('/resources/res-a-01')).body.resource.expires_on, '2027-03-01');
  assert.equal((await ini('/resources/res-a-01/renewals', {})).status, 409);
  const decisions = await Promise.all([apr(`/renewals/${renewal.id}/approve`, {}), apr(`/renewals/${renewal.id}/approve`, {})]);
  assert.deepEqual(decisions.map(r => r.status).sort(), [200, 409]);
  compose('start', 'worker');
  const uncertain = await wait(async () => {
    const detail = (await ini(`/renewals/${renewal.id}`)).body;
    return detail.request.provider_confirmation === 'uncertain' && detail.request.post_attempts === 1 && detail.events.some(e => e.type === 'provider_post' && e.result === 'provider_http_503') ? detail : null;
  }, 'persisted original POST 503');
  const scheduled = Date.parse(uncertain.request.next_check_at);
  const operation = (await request(provider + '/renewals/' + encodeURIComponent(key))).body;
  assert.equal(operation.started_count, 1);
  compose('stop', 'api', 'worker');
  for (const [service, before] of [['provider', providerBefore], ['postgres', dbBefore]]) {
    const current = inspect(id(service)); assert.equal(current.Id, before.Id); assert.equal(current.State.StartedAt, before.State.StartedAt);
  }
  compose('start', 'api', 'worker'); await ready();
  const completed = await wait(async () => {
    const response = await ini(`/renewals/${renewal.id}`);
    return response.status === 200 && response.body.request.status === 'completed' ? response.body : null;
  }, 'completed after API/worker restart');
  assert.equal(completed.resource.expires_on, '2027-03-31');
  assert.equal(completed.request.idempotency_key, key); assert.equal(completed.request.operation_id, operation.operation_id);
  assert.equal(completed.request.post_attempts_total, 1);
  assert.equal(completed.events.filter(e => e.type === 'term_updated').length, 1);
  const confirmation = completed.events.find(e => e.type === 'provider_confirmed');
  assert.ok(Date.parse(confirmation.occurred_at) >= scheduled, 'Persisted delay must be respected');
  assert.equal((await request(provider + '/stats?resource_id=res-a-01')).body.operation_count, 1);
  assert.equal((await request(provider + '/renewals/' + encodeURIComponent(key))).body.started_count, 1);
  const rejected = await ini('/resources/res-a-02/renewals', {});
  assert.equal((await apr(`/renewals/${rejected.body.id}/reject`, {})).status, 200);
  assert.equal((await ini('/resources/res-a-02')).body.resource.expires_on, '2027-05-20');
  assert.equal((await request(provider + '/stats?resource_id=res-a-02')).body.operation_count, 0);
  assert.equal((await apr(`/renewals/${renewal.id}/approve`, {})).status, 409);
  await screenshots(renewal.id);
  const report = { project, nginx: { old_ip: oldIp, new_ip: newIp, unchanged_web: true }, production_seeders_rejected: true, concurrent_approval: [200, 409], first_post: 503, restarted: ['api', 'worker'], preserved: ['provider', 'postgres'], final_status: completed.request.status, expires_on: completed.resource.expires_on, operation_count: 1, started_count: 1, post_attempts_total: 1, term_updated_events: 1, rejected_provider_operations: 0, screenshots: ['desktop', 'mobile'], verified_at: new Date().toISOString() };
  writeFileSync(path.join(output, 'compose-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS fresh Compose company scenario, seeder guards and actual React screenshots');
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
