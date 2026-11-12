import { Op, Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import type { WorkerConfig } from '../config/env';
import { appendAudit } from '../database/audit';
import { RenewalJob, RenewalRequest, Resource } from '../database/models';
import { snapshotMatches } from '../domain/renewal-rules';
import type { Confirmation, ProviderResult } from './provider';

export interface Claim {
  id: string;
  requestId: string;
  token: string;
}
interface Locked {
  req: RenewalRequest;
  job: RenewalJob;
  transaction: Transaction;
  resource: Resource | null;
}

/** All mutations lock request → resource (finalize only) → job and recheck the lease against DB time. */
export class Jobs {
  constructor(
    private readonly db: Sequelize,
    private readonly cfg: WorkerConfig,
  ) {}
  private after(ms: number) {
    return this.db.literal(`clock_timestamp() + interval '${ms} milliseconds'`);
  }

  async claim(): Promise<Claim | null> {
    return this.db.transaction(async (transaction) => {
      const job = await RenewalJob.findOne({
        where: {
          nextRunAt: { [Op.lte]: this.db.literal('clock_timestamp()') },
          [Op.or]: [
            { status: 'queued' },
            { status: 'leased', leaseUntil: { [Op.lte]: this.db.literal('clock_timestamp()') } },
          ],
        },
        order: [
          ['nextRunAt', 'ASC'],
          ['id', 'ASC'],
        ],
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
        transaction,
      });
      if (!job) return null;
      await job.update(
        {
          status: 'leased',
          leaseToken: this.db.literal('lease_token + 1'),
          leaseUntil: this.after(this.cfg.jobLeaseMs),
        },
        { transaction },
      );
      await job.reload({ transaction });
      return { id: job.id, requestId: job.requestId, token: job.leaseToken };
    });
  }

  private async fenced<T>(
    claim: Claim,
    fn: (locked: Locked) => Promise<T>,
    withResource = false,
  ): Promise<T | null> {
    return this.db.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      async (transaction) => {
        const req = await RenewalRequest.findByPk(claim.requestId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!req || req.status !== 'processing') return null;
        const resource = withResource
          ? await Resource.findByPk(req.resourceId, { lock: transaction.LOCK.UPDATE, transaction })
          : null;
        const job = await RenewalJob.findOne({
          where: {
            id: claim.id,
            status: 'leased',
            leaseToken: claim.token,
            leaseUntil: { [Op.gt]: this.db.literal('clock_timestamp()') },
          },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!job) return null;
        return fn({ req, job, transaction, resource });
      },
    );
  }

  private async event(
    l: Locked,
    type: string,
    detail: string,
    result?: string,
    transition?: string,
  ) {
    await appendAudit(l.transaction, {
      workspaceId: l.req.workspaceId,
      resourceId: l.req.resourceId,
      requestId: l.req.id,
      actorId: null,
      type,
      detail,
      result,
      ...(transition ? { fromStatus: 'processing', toStatus: transition } : {}),
    });
  }

  async prepare(
    claim: Claim,
  ): Promise<{ req: RenewalRequest; job: RenewalJob; method: 'POST' | 'GET' } | null> {
    return this.fenced(claim, async (l) => {
      const { req, job, transaction } = l;
      const method =
        job.phase === 'post' && job.postAttempts < 3 && req.providerConfirmation !== 'confirmed'
          ? 'POST'
          : 'GET';
      if (method === 'POST') {
        await job.update(
          {
            postAttempts: job.postAttempts + 1,
            postAttemptsTotal: job.postAttemptsTotal + 1,
            lastAttemptAt: this.db.fn('clock_timestamp'),
            phase: 'check',
            nextRunAt: this.after(this.cfg.retryDelayMs),
          },
          { transaction },
        );
        await req.update({ providerConfirmation: 'uncertain' }, { transaction });
        await this.event(
          l,
          'attempt_reserved',
          'Возможная POST-отправка зарезервирована до сетевого вызова.',
          `Попытка ${job.postAttempts} из 3`,
        );
      } else {
        await job.update({ checkAttempts: job.checkAttempts + 1 }, { transaction });
      }
      return { req, job, method };
    });
  }

  private async attention(l: Locked, reason: string) {
    await l.req.update(
      {
        status: 'requires_attention',
        attentionReason: reason,
        providerConfirmation:
          l.req.providerConfirmation === 'confirmed' ? 'confirmed' : 'not_confirmed',
      },
      { transaction: l.transaction },
    );
    await l.job.update(
      { status: 'attention', leaseUntil: null, lastErrorCode: reason },
      { transaction: l.transaction },
    );
    await this.event(
      l,
      'requires_attention',
      'Автоматическая обработка остановлена; требуется проверка результата.',
      reason,
      'requires_attention',
    );
  }

  async record(claim: Claim, method: 'POST' | 'GET', result: ProviderResult): Promise<void> {
    if (result.kind === 'confirmed') {
      await this.finalize(claim, result.confirmation, method);
      return;
    }
    await this.fenced(claim, async (l) => {
      await this.event(
        l,
        method === 'POST' ? 'provider_post' : 'provider_check',
        `${method} завершён без подтверждения.`,
        result.code,
      );
      if (
        result.kind === 'permanent' ||
        (method === 'GET' &&
          (l.job.postAttempts >= 3 ||
            l.job.checkAttempts >= this.cfg.maxChecksPerCycle ||
            l.req.providerConfirmation === 'confirmed'))
      ) {
        await this.attention(
          l,
          l.req.providerConfirmation === 'confirmed'
            ? 'provider_evidence_discrepancy'
            : result.kind === 'permanent'
              ? result.code
              : 'attempts_exhausted',
        );
        return;
      }
      await l.req.update({ providerConfirmation: 'uncertain' }, { transaction: l.transaction });
      await l.job.update(
        {
          status: 'queued',
          phase: method === 'POST' ? 'check' : 'post',
          nextRunAt: this.after(this.cfg.retryDelayMs),
          leaseUntil: null,
          lastErrorCode: result.code,
        },
        { transaction: l.transaction },
      );
    });
  }

  async finalize(claim: Claim, confirmation: Confirmation, method: 'POST' | 'GET'): Promise<void> {
    await this.fenced(
      claim,
      async (l) => {
        const { req, job, resource, transaction } = l;
        await this.event(
          l,
          method === 'POST' ? 'provider_post' : 'provider_check',
          `${method}: получен валидированный результат.`,
          '200 · completed',
        );
        if (req.operationId && req.operationId !== confirmation.operation_id) {
          await this.attention(l, 'provider_operation_conflict');
          return;
        }
        await req.update(
          { providerConfirmation: 'confirmed', operationId: confirmation.operation_id },
          { transaction },
        );
        await this.event(
          l,
          'provider_confirmed',
          'Провайдер подтвердил выполнение операции.',
          'Подтверждено',
        );
        if (
          !resource ||
          resource.workspaceId !== req.workspaceId ||
          !snapshotMatches(req, resource)
        ) {
          await this.attention(l, 'resource_changed');
          return;
        }
        const [count] = await Resource.update(
          { expiresOn: req.newExpiresOn, updatedAt: this.db.fn('clock_timestamp') },
          {
            where: {
              id: req.resourceId,
              workspaceId: req.workspaceId,
              expiresOn: req.previousExpiresOn,
              amountMinor: req.amountMinor,
              currency: req.currency,
            },
            transaction,
          },
        );
        if (count !== 1) throw new Error('resource update invariant');
        await req.update(
          { status: 'completed', attentionReason: null, updatedAt: this.db.fn('clock_timestamp') },
          { transaction },
        );
        await job.update(
          { status: 'done', leaseUntil: null, lastErrorCode: null },
          { transaction },
        );
        await this.event(
          l,
          'term_updated',
          'Срок ресурса установлен из неизменяемого снимка заявки.',
          'Продлено на 30 дней',
          'completed',
        );
      },
      true,
    );
  }
}
