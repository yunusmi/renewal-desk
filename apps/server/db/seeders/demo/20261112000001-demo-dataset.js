'use strict';
const { randomUUID } = require('node:crypto');
const { WORKSPACES, USERS, RESOURCES } = require('../../data/core');
const { assertFictionalSeedEnvironment, claimDataset, insertUsers } = require('../../data/seed-helpers');
const extraUsers = [
  ['u-apr-b', 'approver.beta', 'Ирина Соколова', 'beta', false, true],
  ['u-ini-o', 'initiator.orion', 'Павел Зуев', 'orion', true, false],
  ['u-apr-o', 'approver.orion', 'Елена Гарина', 'orion', false, true],
].map(([id, login, name, workspace_id, can_initiate, can_approve]) => ({ id, email: `${login}@renewaldesk.test`, name, workspace_id, can_initiate, can_approve }));
const extraResources = [
  ['res-a-03', 'alpha', 'Объектное хранилище · архив документов', 'Облачные хранилища', '2026-11-16', 98000],
  ['res-a-04', 'alpha', 'PostgreSQL · платёжный контур', 'Базы данных', '2027-02-10', 420000],
  ['res-a-05', 'alpha', 'Лицензии IDE · 40 мест', 'Программные лицензии', '2026-12-01', 360000],
  ['res-a-06', 'alpha', 'Мониторинг инфраструктуры', 'Мониторинг', '2026-11-28', 74000],
  ['res-a-07', 'alpha', 'Резервное копирование виртуальных машин', 'Резервное копирование', '2027-04-05', 189000],
  ['res-a-08', 'alpha', 'Корпоративная подписка на офисный пакет · отдел продаж и сопровождения клиентов — юридических лиц', 'Корпоративные подписки', '2027-08-30', 1240000],
  ['res-a-09', 'alpha', 'Балансировщик нагрузки · внешний контур', 'Инфраструктурные сервисы', '2026-12-20', 156000],
  ['res-b-02', 'beta', 'Аналитическое хранилище событий', 'Аналитика', '2027-01-22', 310000],
  ['res-b-03', 'beta', 'Лицензии BI-платформы', 'Программные лицензии', '2027-03-15', 275000],
  ['res-o-01', 'orion', 'Хранилище логов', 'Облачные хранилища', '2026-12-05', 64000],
  ['res-o-02', 'orion', 'Мониторинг приложений', 'Мониторинг', '2027-02-01', 88000],
  ['res-o-03', 'orion', 'Резервное копирование баз данных', 'Резервное копирование', '2027-01-10', 142000],
].map(([id, workspace_id, name, category, expires_on, amount_minor]) => ({ id, workspace_id, name, category, expires_on, amount_minor, currency: 'RUB' }));
const add30 = d => { const date = new Date(`${d}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 30); return date.toISOString().slice(0, 10); };
module.exports = {
  async up(qi) {
    assertFictionalSeedEnvironment();
    await qi.sequelize.transaction(async transaction => {
      await claimDataset(qi, 'demo', transaction);
      // Serialize seeders without touching domain rows or resetting running jobs.
      const ready = await qi.rawSelect('dataset_meta', { where: { key: 'demo_seed_complete' }, transaction }, 'value');
      if (ready) return;
      await qi.bulkInsert('workspaces', [...WORKSPACES, { id: 'orion', name: 'Orion' }], { transaction, ignoreDuplicates: true });
      await insertUsers(qi, [...USERS, ...extraUsers], transaction);
      const resources = [...RESOURCES, ...extraResources].map(r => ({ ...r }));
      const requests = [];
      const events = [];
      const jobs = [];
      const definitions = [
        ['RN-0895', 'res-a-03', 'u-ini-a', 'u-apr-a', '2026-10-14', 'completed'],
        ['RN-0901', 'res-a-03', 'u-uni-a', 'u-apr-a', '2026-10-28', 'completed'],
        ['RN-0902', 'res-a-05', 'u-uni-a', 'u-apr-a', '2026-11-03', 'rejected'],
        ['RN-0903', 'res-a-06', 'u-ini-a', 'u-uni-a', '2026-11-06', 'requires_attention'],
        ['RN-0904', 'res-a-04', 'u-ini-a', null, '2026-11-11', 'pending_approval'],
        ['RN-0905', 'res-a-07', 'u-uni-a', null, '2026-11-12', 'pending_approval'],
        ['RN-0906', 'res-a-09', 'u-ini-a', 'u-apr-a', '2026-11-12', 'processing'],
        ['RN-0907', 'res-b-02', 'u-ini-b', 'u-apr-b', '2026-10-20', 'completed'],
        ['RN-0908', 'res-b-03', 'u-ini-b', null, '2026-11-10', 'pending_approval'],
        ['RN-0909', 'res-o-01', 'u-ini-o', 'u-apr-o', '2026-11-02', 'completed'],
        ['RN-0910', 'res-o-03', 'u-ini-o', 'u-apr-o', '2026-11-09', 'rejected'],
      ];
      for (const [id, rid, author, decider, day, status] of definitions) {
        const r = resources.find(r => r.id === rid);
        const created = new Date(`${day}T08:20:00Z`);
        const decided = decider ? new Date(`${day}T11:40:00Z`) : null;
        const snapshot = { previous_expires_on: r.expires_on, new_expires_on: add30(r.expires_on) };
        const historical = status === 'completed' || status === 'rejected';
        const request = { id, workspace_id: r.workspace_id, resource_id: rid, ...snapshot, amount_minor: r.amount_minor, currency: 'RUB', status, created_by: author, created_at: created, decided_by: decider, decided_at: decided, idempotency_key: `renewal:demo:${id}`, provider_confirmation: status === 'completed' ? 'confirmed' : status === 'requires_attention' ? 'not_confirmed' : 'pending', operation_id: status === 'completed' ? randomUUID() : null, fixture_origin: historical ? 'demo_history' : null, attention_reason: status === 'requires_attention' ? 'attempts_exhausted' : null };
        requests.push(request);
        const base = { workspace_id: r.workspace_id, request_id: id, resource_id: rid, fixture_origin: 'demo_history' };
        const event = (type, actor_id, from_status, to_status, occurred_at, detail) => events.push({ ...base, type, actor_id, from_status, to_status, occurred_at, detail });
        event('request_created', author, null, 'pending_approval', created, 'Иллюстративная история: заявка создана.');
        if (decider) event(status === 'rejected' ? 'request_rejected' : 'request_approved', decider, 'pending_approval', status === 'rejected' ? 'rejected' : 'processing', decided, 'Иллюстративная история: решение согласующего.');
        if (status === 'completed') {
          r.expires_on = snapshot.new_expires_on;
          event('term_updated', null, 'processing', 'completed', new Date(`${day}T11:41:00Z`), 'Историческая демо-запись, синтетический ID операции; текущий провайдер не вызывался.');
        }
        if (status === 'processing' || status === 'requires_attention') {
          const attention = status === 'requires_attention';
          jobs.push({ id: randomUUID(), request_id: id, payload_resource_id: rid, payload_period_months: 1, payload_amount_minor: r.amount_minor, payload_currency: 'RUB', status: attention ? 'attention' : 'queued', phase: attention ? 'check' : 'post', next_run_at: new Date(Date.now() + 90000), post_attempts: attention ? 3 : 0, post_attempts_total: attention ? 3 : 0 });
          event('job_enqueued', null, null, null, decided, 'Демо-задача. Исторические попытки не являются реальными отправками.');
          if (attention) event('requires_attention', null, 'processing', 'requires_attention', decided, 'Иллюстративное исчерпание трёх попыток. Bootstrap отдельно создаёт реальную операцию для GET/retry.');
        }
      }
      await qi.bulkInsert('resources', resources, { transaction, ignoreDuplicates: true });
      await qi.bulkInsert('renewal_requests', requests, { transaction });
      await qi.bulkInsert('renewal_jobs', jobs, { transaction });
      await qi.bulkInsert('audit_events', events, { transaction });
      await qi.bulkInsert('dataset_meta', [{ key: 'demo_seed_complete', value: '1' }], { transaction });
    });
  },
  async down() {},
};
