import 'reflect-metadata';
import pino from 'pino';
import { loadWorkerConfig } from './config/env';
import { REDACT_PATHS } from './common/logging';
import { createSequelize } from './database/sequelize';
import { WorkerRunner } from './worker/runner';

async function main(): Promise<void> {
  const cfg = loadWorkerConfig();
  const logger = pino({ level: cfg.logLevel, redact: { paths: REDACT_PATHS, censor: '[redacted]' }, base: { svc: 'worker' } });
  const sequelize = createSequelize(cfg.databaseUrl, { poolMax: cfg.workerConcurrency + 2 });
  const runner = new WorkerRunner(sequelize, cfg, logger);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'worker stopping');
    await runner.stop();
    await sequelize.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info(
    {
      provider: cfg.providerBaseUrl,
      retry_delay_ms: cfg.retryDelayMs,
      provider_timeout_ms: cfg.providerTimeoutMs,
      job_lease_ms: cfg.jobLeaseMs,
      poll_ms: cfg.workerPollMs,
      concurrency: cfg.workerConcurrency,
    },
    'worker starting',
  );
  await runner.start();
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: 'worker failed', error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
