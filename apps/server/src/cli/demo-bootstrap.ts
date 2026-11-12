import 'reflect-metadata';
import { loadWorkerConfig } from '../config/env';
import { createSequelize } from '../database/sequelize';
import { DatasetMeta, RenewalJob, RenewalRequest } from '../database/models';
import { ProviderClient } from '../worker/provider';

async function main() {
  const cfg = loadWorkerConfig();
  if (cfg.dataset !== 'demo') throw new Error('Demo bootstrap requires DATASET=demo');
  const db = createSequelize(cfg.databaseUrl);
  try {
    if ((await DatasetMeta.findByPk('dataset_kind'))?.value !== 'demo')
      throw new Error('Demo dataset marker required');
    const req = await RenewalRequest.findByPk('RN-0903');
    const job = await RenewalJob.findOne({ where: { requestId: 'RN-0903' } });
    if (!req || !job) throw new Error('Seed demo first');
    const client = new ProviderClient(cfg);
    // Inspect first: repeated bootstrap never recreates an existing operation.
    let result = await client.call('GET', req.idempotencyKey, job);
    if (result.kind !== 'confirmed') {
      if (result.kind !== 'transient' || result.code !== 'provider_http_404')
        throw new Error('Demo provider check failed');
      await client.call('POST', req.idempotencyKey, job);
      result = await client.call('GET', req.idempotencyKey, job);
    }
    if (result.kind !== 'confirmed') throw new Error('Demo provider bootstrap not confirmed');
    console.log(
      'Demo RN-0903: real provider operation verified, started_count=1. Retry will reconcile via GET.',
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error('Demo bootstrap failed; check demo provider and dataset configuration.');
  process.exitCode = 1;
});
