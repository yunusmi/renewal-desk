import jwt from 'jsonwebtoken';
import type { Sequelize } from 'sequelize-typescript';
import {
  AuthSession,
  RenewalRequest,
  Resource,
  User,
  Workspace,
  WorkspaceMember,
} from '../src/database/models';
import { Client, EMAILS, loggedIn, startApi, type TestApi } from './helpers/api';
import { resetTestDb, testSequelize } from './helpers/db';

let sequelize: Sequelize;
let api: TestApi;

beforeAll(async () => {
  sequelize = testSequelize();
  api = await startApi(sequelize);
});
beforeEach(async () => resetTestDb(sequelize));
afterAll(async () => {
  await api.close();
  await sequelize.close();
});

describe('A01 core dataset and login', () => {
  it('has exactly 2 workspaces, 3 resources, 4 users, 0 requests with exact values', async () => {
    expect(await Workspace.count()).toBe(2);
    expect(await User.count()).toBe(4);
    expect(await RenewalRequest.count()).toBe(0);
    const res = await Resource.findAll({ order: [['id', 'ASC']], raw: true });
    expect(
      res.map((r) => [r.id, r.workspaceId, r.name, r.expiresOn, r.amountMinor, r.currency]),
    ).toEqual([
      ['res-a-01', 'alpha', 'Хранилище A', '2027-03-01', 128000, 'RUB'],
      ['res-a-02', 'alpha', 'Сервис B', '2027-05-20', 250000, 'RUB'],
      ['res-b-01', 'beta', 'Сервис C', '2027-06-01', 150000, 'RUB'],
    ]);
    const members = await WorkspaceMember.findAll({ order: [['userId', 'ASC']], raw: true });
    expect(members.map((m) => [m.userId, m.workspaceId, m.canInitiate, m.canApprove])).toEqual([
      ['u-apr-a', 'alpha', false, true],
      ['u-ini-a', 'alpha', true, false],
      ['u-ini-b', 'beta', true, false],
      ['u-uni-a', 'alpha', true, true],
    ]);
  });

  it('stores bcrypt hashes, not plaintext', async () => {
    for (const u of await User.findAll()) {
      expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(u.passwordHash).not.toContain('demo1234');
    }
  });

  it.each(Object.entries(EMAILS))(
    '%s logs in with HttpOnly SameSite=Strict cookie, no token in JSON',
    async (_, email) => {
      const c = new Client(api.baseUrl);
      const res = await c.login(email);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie')!;
      expect(setCookie).toMatch(/^renewaldesk_session=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Strict/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ|token|password/i);
      expect(Object.keys(res.body.user).sort()).toEqual([
        'email',
        'id',
        'name',
        'roles',
        'workspace_id',
        'workspace_name',
      ]);
      const me = await c.get('/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(email);
    },
  );

  it('returns roles from DB membership', async () => {
    const uni = await loggedIn(api.baseUrl, EMAILS.uniA);
    expect((await uni.get('/auth/me')).body).toMatchObject({
      workspace_id: 'alpha',
      roles: ['initiator', 'approver'],
    });
    const iniB = await loggedIn(api.baseUrl, EMAILS.iniB);
    expect((await iniB.get('/auth/me')).body).toMatchObject({
      workspace_id: 'beta',
      roles: ['initiator'],
    });
  });
});

describe('A02 authentication, sessions, CSRF and Origin', () => {
  it('missing, malformed, forged and expired tokens → 401', async () => {
    const anon = new Client(api.baseUrl);
    expect((await anon.get('/resources')).body).toEqual({
      status_code: 401,
      error_code: 'unauthenticated',
      message: expect.any(String),
    });
    anon.cookie = 'renewaldesk_session=garbage';
    expect((await anon.get('/resources')).status).toBe(401);
    anon.cookie = `renewaldesk_session=${jwt.sign({ sid: 'x' }, 'wrong-secret-wrong-secret-wrong-secret', { subject: 'u-ini-a' })}`;
    expect((await anon.get('/resources')).status).toBe(401);

    const c = await loggedIn(api.baseUrl, EMAILS.iniA);
    await AuthSession.update({ expiresAt: new Date(Date.now() - 1000) }, { where: {} });
    expect((await c.get('/resources')).status).toBe(401);
  });

  it('wrong password and unknown email give the same generic 401', async () => {
    const a = await new Client(api.baseUrl).login(EMAILS.iniA, 'wrong');
    const b = await new Client(api.baseUrl).login('nobody@renewaldesk.test', 'demo1234');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error_code).toBe('invalid_credentials');
  });

  it('logout revokes the server session: the old cookie stops working', async () => {
    const c = await loggedIn(api.baseUrl, EMAILS.iniA);
    const oldCookie = c.cookie;
    expect((await c.post('/auth/logout')).status).toBe(204);
    const replay = new Client(api.baseUrl);
    replay.cookie = oldCookie;
    expect((await replay.get('/auth/me')).status).toBe(401);
    expect(await AuthSession.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('unsafe requests require exact Origin and a session-bound CSRF token', async () => {
    const c = await loggedIn(api.baseUrl, EMAILS.iniA);
    const noCsrf = await c.request('POST', '/api/v1/resources/res-a-01/renewals', {
      headers: { 'X-CSRF-Token': '' },
    });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error_code).toBe('csrf_invalid');

    const other = await loggedIn(api.baseUrl, EMAILS.uniA);
    const foreignToken = await c.request('POST', '/api/v1/resources/res-a-01/renewals', {
      headers: { 'X-CSRF-Token': other.csrf! },
    });
    expect(foreignToken.body.error_code).toBe('csrf_invalid');

    const evil = new Client(api.baseUrl, 'http://evil.example');
    evil.cookie = c.cookie;
    evil.csrf = c.csrf;
    const badOrigin = await evil.post('/resources/res-a-01/renewals');
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.error_code).toBe('origin_forbidden');

    const badLoginOrigin = await new Client(api.baseUrl, 'http://evil.example').login(EMAILS.iniA);
    expect(badLoginOrigin.body.error_code).toBe('origin_forbidden');

    expect(await RenewalRequest.count()).toBe(0);
    expect((await c.post('/resources/res-a-01/renewals')).status).toBe(201);
  });

  it('rate-limits login attempts per account', async () => {
    const limited = await startApi(sequelize, { loginRateLimit: 3 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++)
        statuses.push((await new Client(limited.baseUrl).login(EMAILS.iniA, 'bad')).status);
      expect(statuses).toEqual([401, 401, 401, 429, 429]);
    } finally {
      await limited.close();
    }
  });

  it('rejects malformed JSON and unknown login fields with 400', async () => {
    const c = new Client(api.baseUrl);
    expect(
      (await c.request('POST', '/api/v1/auth/login', { rawBody: '{bad' })).body.error_code,
    ).toBe('validation_error');
    const extra = await c.request('POST', '/api/v1/auth/login', {
      body: { email: EMAILS.iniA, password: 'demo1234', role: 'approver' },
    });
    expect(extra.status).toBe(400);
  });
});

describe('A03 workspace isolation', () => {
  let alphaReq: string;
  beforeEach(async () => {
    const ini = await loggedIn(api.baseUrl, EMAILS.iniA);
    alphaReq = (await ini.post('/resources/res-a-01/renewals')).body.id;
  });

  it('Beta lists only Beta data', async () => {
    const b = await loggedIn(api.baseUrl, EMAILS.iniB);
    expect((await b.get('/resources')).body.items.map((r: { id: string }) => r.id)).toEqual([
      'res-b-01',
    ]);
    expect((await b.get('/renewals')).body).toMatchObject({ total: 0, workspace_total: 0 });
    expect((await b.get('/audit-events')).body.total).toBe(0);
    const ov = (await b.get('/overview')).body;
    expect(ov.counts.resources_total).toBe(1);
    expect(ov.recent_requests).toEqual([]);
    expect((await b.get('/resources?q=res-a')).body.total).toBe(0);
  });

  it('known foreign IDs → 403 workspace_forbidden without data; unknown → 404', async () => {
    const b = await loggedIn(api.baseUrl, EMAILS.iniB);
    const cases: [string, string][] = [
      ['GET', '/resources/res-a-01'],
      ['GET', `/renewals/${alphaReq}`],
      ['POST', '/resources/res-a-01/renewals'],
      ['POST', `/renewals/${alphaReq}/approve`],
      ['POST', `/renewals/${alphaReq}/reject`],
      ['POST', `/renewals/${alphaReq}/retry`],
      ['GET', '/audit-events?resource_id=res-a-01'],
    ];
    for (const [method, path] of cases) {
      const res = await b.request(method, `/api/v1${path}`);
      expect([path, res.status, res.body.error_code]).toEqual([path, 403, 'workspace_forbidden']);
      expect(JSON.stringify(res.body)).not.toMatch(/Хранилище|2027-03-01|128000/);
    }
    expect((await b.get('/resources/res-zz-99')).body.error_code).toBe('resource_not_found');
    expect((await b.get('/renewals/RN-9999')).body.error_code).toBe('request_not_found');
    expect((await RenewalRequest.findByPk(alphaReq))!.status).toBe('pending_approval');
  });
});

describe('A04 roles and spoofing', () => {
  it('approver cannot create; initiator cannot approve/reject/retry', async () => {
    const apr = await loggedIn(api.baseUrl, EMAILS.aprA);
    expect((await apr.post('/resources/res-a-01/renewals')).body.error_code).toBe('role_forbidden');
    const ini = await loggedIn(api.baseUrl, EMAILS.iniA);
    const id = (await ini.post('/resources/res-a-01/renewals')).body.id;
    for (const action of ['approve', 'reject', 'retry']) {
      const res = await ini.post(`/renewals/${id}/${action}`);
      expect([action, res.status, res.body.error_code]).toEqual([action, 403, 'role_forbidden']);
    }
  });

  it('universal user cannot approve or reject own request', async () => {
    const uni = await loggedIn(api.baseUrl, EMAILS.uniA);
    const id = (await uni.post('/resources/res-a-02/renewals')).body.id;
    for (const action of ['approve', 'reject']) {
      const res = await uni.post(`/renewals/${id}/${action}`);
      expect([action, res.status, res.body.error_code]).toEqual([
        action,
        403,
        'cannot_decide_own_request',
      ]);
    }
    expect((await RenewalRequest.findByPk(id))!.status).toBe('pending_approval');
  });

  it('rejects any client-supplied workspace/role/author/amount/date fields with 400 and no mutation', async () => {
    const ini = await loggedIn(api.baseUrl, EMAILS.iniA);
    for (const body of [
      { amount_minor: 1 },
      { new_expires_on: '2099-01-01' },
      { workspace_id: 'beta' },
      { created_by: 'u-apr-a' },
      { roles: ['approver'] },
    ]) {
      const res = await ini.post('/resources/res-a-01/renewals', body);
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
    expect(await RenewalRequest.count()).toBe(0);
    const ok = await ini.post('/resources/res-a-01/renewals', {});
    expect(ok.status).toBe(201);
    const apr = await loggedIn(api.baseUrl, EMAILS.aprA);
    expect(
      (await apr.post(`/renewals/${ok.body.id}/approve`, { decided_by: 'u-uni-a' })).status,
    ).toBe(400);
  });
});
