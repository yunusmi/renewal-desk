/**
 * Environment validation. Each runtime (API, worker, CLI) loads only the
 * sections it needs and fails fast on missing or weak configuration.
 */

export class ConfigError extends Error {}

type Env = NodeJS.ProcessEnv;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing required environment variable ${name}`);
  return value;
}

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ConfigError(`${name} must be true or false`);
}

function oneOf<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = (env[name]?.trim() || fallback) as T;
  if (!allowed.includes(raw)) throw new ConfigError(`${name} must be one of ${allowed.join(', ')}`);
  return raw;
}

export const DATASETS = ['core', 'demo', 'test'] as const;
export type Dataset = (typeof DATASETS)[number];
export const APP_ENVS = ['development', 'test', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export interface DbConfig {
  appEnv: AppEnv;
  dataset: Dataset;
  databaseUrl: string;
  logLevel: string;
}

export interface ApiConfig extends DbConfig {
  port: number;
  appOrigin: string;
  jwtSecret: string;
  csrfSecret: string;
  jwtTtlSeconds: number;
  cookieSecure: boolean;
  demoLoginEnabled: boolean;
  loginRateLimit: number;
  loginRateWindowMs: number;
}

export interface WorkerConfig extends DbConfig {
  providerBaseUrl: string;
  providerTimeoutMs: number;
  retryDelayMs: number;
  jobLeaseMs: number;
  workerPollMs: number;
  workerConcurrency: number;
  maxChecksPerCycle: number;
}

const WEAK_SECRETS = /change[-_]?me|secret|password|example|generate/i;

function secret(env: Env, name: string, appEnv: AppEnv): string {
  const value = required(env, name);
  if (value.length < 32) throw new ConfigError(`${name} must be at least 32 characters`);
  if (appEnv !== 'test' && WEAK_SECRETS.test(value)) {
    throw new ConfigError(`${name} looks like a placeholder; generate a random value`);
  }
  return value;
}

export function loadDbConfig(env: Env = process.env): DbConfig {
  return {
    appEnv: oneOf(env, 'APP_ENV', APP_ENVS, 'development'),
    dataset: oneOf(env, 'DATASET', DATASETS, 'core'),
    databaseUrl: required(env, 'DATABASE_URL'),
    logLevel: oneOf(
      env,
      'LOG_LEVEL',
      ['fatal', 'error', 'warn', 'info', 'debug', 'silent'],
      'info',
    ),
  };
}

export function loadApiConfig(env: Env = process.env): ApiConfig {
  const db = loadDbConfig(env);
  const appOrigin = required(env, 'APP_ORIGIN');
  let parsed: URL;
  try {
    parsed = new URL(appOrigin);
  } catch {
    throw new ConfigError('APP_ORIGIN must be an absolute origin, e.g. http://localhost:8080');
  }
  if (parsed.origin !== appOrigin)
    throw new ConfigError('APP_ORIGIN must be an origin without path');
  const jwtSecret = secret(env, 'JWT_SECRET', db.appEnv);
  const csrfSecret = secret(env, 'CSRF_SECRET', db.appEnv);
  if (jwtSecret === csrfSecret) throw new ConfigError('JWT_SECRET and CSRF_SECRET must differ');
  const cookieSecure = bool(env, 'COOKIE_SECURE', db.appEnv === 'production');
  if (db.appEnv === 'production' && !cookieSecure) {
    throw new ConfigError('COOKIE_SECURE=false is allowed only for local HTTP development');
  }
  return {
    ...db,
    port: int(env, 'PORT', 3000, 1, 65535),
    appOrigin,
    jwtSecret,
    csrfSecret,
    jwtTtlSeconds: int(env, 'JWT_TTL_SECONDS', 1800, 60, 86400),
    cookieSecure,
    demoLoginEnabled: bool(env, 'DEMO_LOGIN_ENABLED', false),
    loginRateLimit: int(env, 'LOGIN_RATE_LIMIT', 10, 1, 10000),
    loginRateWindowMs: int(env, 'LOGIN_RATE_WINDOW_MS', 60000, 1000, 3600000),
  };
}

export function loadWorkerConfig(env: Env = process.env): WorkerConfig {
  const db = loadDbConfig(env);
  const providerBaseUrl = required(env, 'PROVIDER_BASE_URL').replace(/\/+$/, '');
  try {
    new URL(providerBaseUrl);
  } catch {
    throw new ConfigError('PROVIDER_BASE_URL must be an absolute URL');
  }
  const cfg: WorkerConfig = {
    ...db,
    providerBaseUrl,
    providerTimeoutMs: int(env, 'PROVIDER_TIMEOUT_MS', 5000, 100, 120000),
    retryDelayMs: int(env, 'RETRY_DELAY_MS', 6000, 0, 3600000),
    jobLeaseMs: int(env, 'JOB_LEASE_MS', 30000, 1000, 3600000),
    workerPollMs: int(env, 'WORKER_POLL_MS', 500, 50, 60000),
    workerConcurrency: int(env, 'WORKER_CONCURRENCY', 1, 1, 32),
    maxChecksPerCycle: int(env, 'MAX_CHECKS_PER_CYCLE', 6, 1, 100),
  };
  // The lease must outlive one HTTP call plus the DB writes around it.
  if (cfg.jobLeaseMs < cfg.providerTimeoutMs * 2 + 2000) {
    throw new ConfigError('JOB_LEASE_MS must be >= 2 * PROVIDER_TIMEOUT_MS + 2000');
  }
  return cfg;
}
