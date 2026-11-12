/* eslint-disable @typescript-eslint/no-explicit-any -- Test client deliberately accepts arbitrary JSON to assert invalid contracts. */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Sequelize } from 'sequelize-typescript';
import { createApp } from '../../src/api/create-app';
import type { ApiConfig } from '../../src/config/env';
import { TEST_ORIGIN, testApiConfig } from './env';

export interface TestApi {
  app: INestApplication;
  baseUrl: string;
  close(): Promise<void>;
}

/** Real Nest API listening on an ephemeral loopback port (real HTTP, real DB). */
export async function startApi(
  sequelize: Sequelize,
  over: Partial<ApiConfig> = {},
): Promise<TestApi> {
  const app = await createApp(testApiConfig(over), { sequelize });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}`, close: () => app.close() };
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Minimal browser-like client: cookie jar, Origin header, in-memory CSRF token. */
export class Client {
  cookie: string | null = null;
  csrf: string | null = null;

  constructor(
    readonly baseUrl: string,
    readonly origin: string = TEST_ORIGIN,
  ) {}

  async request<T = any>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string>; rawBody?: string } = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = { Origin: this.origin, ...opts.headers };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf && method !== 'GET' && !('X-CSRF-Token' in headers))
      headers['X-CSRF-Token'] = this.csrf;
    let body: string | undefined = opts.rawBody;
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    } else if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    }
    const res = await fetch(this.baseUrl + path, { method, headers, body, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('renewaldesk_session=')) {
      const value = setCookie.split(';')[0];
      this.cookie = value === 'renewaldesk_session=' ? null : value;
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', `/api/v1${path}`);
  }

  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', `/api/v1${path}`, { body });
  }

  async login(email: string, password = 'demo1234'): Promise<Res> {
    const res = await this.request('POST', '/api/v1/auth/login', { body: { email, password } });
    if (res.status === 200) {
      const csrf = await this.get('/auth/csrf');
      this.csrf = csrf.body.csrf_token;
    }
    return res;
  }
}

export const EMAILS = {
  iniA: 'initiator.alpha@renewaldesk.test',
  aprA: 'approver.alpha@renewaldesk.test',
  iniB: 'initiator.beta@renewaldesk.test',
  uniA: 'universal.alpha@renewaldesk.test',
};

export async function loggedIn(baseUrl: string, email: string): Promise<Client> {
  const c = new Client(baseUrl);
  const res = await c.login(email);
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return c;
}
