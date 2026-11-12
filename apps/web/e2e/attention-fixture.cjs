// Test-only pre-existing ambiguous operation. No HTTP fault/reset endpoint in the application.
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { createSequelize } = require('../../server/dist/database/sequelize');
const { DatasetMeta, Resource, RenewalRequest, RenewalJob } = require('../../server/dist/database/models');
const databaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://renewaldesk:test-only-local-password@127.0.0.1:55432/renewaldesk_test';
const url = new URL(databaseUrl);
if (!url.pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Test DB required');
(async () => {
  const db = createSequelize(databaseUrl);
  try {
    if ((await DatasetMeta.findByPk('dataset_kind'))?.value !== 'test') throw new Error('Test marker required');
    const key = `renewal:e2e-attention:${randomUUID()}`;
    await db.transaction(async transaction => {
      await Resource.update({ name: 'Корпоративная подписка на офисный пакет · отдел продаж и сопровождения клиентов — юридических лиц' }, { where: { id: 'res-a-01' }, transaction });
      await RenewalRequest.create({ id: 'RN-9001', workspaceId: 'alpha', resourceId: 'res-a-01', status: 'requires_attention', previousExpiresOn: '2027-03-01', newExpiresOn: '2027-03-31', amountMinor: 128000, currency: 'RUB', idempotencyKey: key, createdBy: 'u-ini-a', decidedBy: 'u-apr-a', decidedAt: new Date(), providerConfirmation: 'not_confirmed', attentionReason: 'attempts_exhausted' }, { transaction });
      await RenewalJob.create({ id: randomUUID(), requestId: 'RN-9001', payloadResourceId: 'res-a-01', payloadPeriodMonths: 1, payloadAmountMinor: 128000, payloadCurrency: 'RUB', status: 'attention', phase: 'check', postAttempts: 3, postAttemptsTotal: 3 }, { transaction });
    });
    const response = await fetch(`${process.env.TEST_PROVIDER_URL || 'http://127.0.0.1:18191'}/renewals`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ resource_id: 'res-a-01', period_months: 1, amount_minor: 128000, currency: 'RUB' }) });
    if (response.status !== 503) throw new Error('Expected original simulator response loss');
  } finally { await db.close(); }
})().catch(err => { console.error(err.name); process.exitCode = 1; });
