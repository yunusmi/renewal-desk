import type { ApiConfig, WorkerConfig } from '../../src/config/env';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://renewaldesk:test-only-local-password@127.0.0.1:55432/renewaldesk_test';
export const TEST_PROVIDER_URL = process.env.TEST_PROVIDER_URL ?? 'http://127.0.0.1:18191';
export const TEST_ORIGIN = 'http://test.renewaldesk.local';

/** Refuses anything but an isolated test database. */
export function assertTestDatabase(url: string): void {
  const u = new URL(url);
  const dbName = u.pathname.replace(/^\//, '');
  const hostOk = ['127.0.0.1', 'localhost', 'postgres-test', 'postgres'].includes(u.hostname);
  if (!hostOk || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test database ${u.hostname}/${dbName}`);
  }
}

export function testApiConfig(over: Partial<ApiConfig> = {}): ApiConfig {
  return {
    appEnv: 'test',
    dataset: 'test',
    databaseUrl: TEST_DATABASE_URL,
    logLevel: 'silent',
    port: 0,
    appOrigin: TEST_ORIGIN,
    jwtSecret: 'test-jwt-secret-0123456789abcdef0123456789abcdef',
    csrfSecret: 'test-csrf-secret-0123456789abcdef0123456789abcdef',
    jwtTtlSeconds: 1800,
    cookieSecure: false,
    demoLoginEnabled: false,
    loginRateLimit: 1000,
    loginRateWindowMs: 60000,
    ...over,
  };
}

export function testWorkerConfig(over: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    appEnv: 'test',
    dataset: 'test',
    databaseUrl: TEST_DATABASE_URL,
    logLevel: 'silent',
    providerBaseUrl: TEST_PROVIDER_URL,
    providerTimeoutMs: 2000,
    retryDelayMs: 300,
    jobLeaseMs: 6000,
    workerPollMs: 50,
    workerConcurrency: 1,
    maxChecksPerCycle: 6,
    ...over,
  };
}
