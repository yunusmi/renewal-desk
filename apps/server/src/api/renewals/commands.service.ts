import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { appendAudit } from '../../database/audit';
import { RenewalJob, RenewalRequest, Resource } from '../../database/models';
import {
  ACTIVE_STATUSES,
  addCalendarDays,
  createDenial,
  decisionDenial,
  providerPayload,
  RENEWAL_DAYS,
  retryDenial,
  snapshotMatches,
  type Denial,
  type RenewalStatusValue,
} from '../../domain/renewal-rules';
import type { Principal } from '../auth/principal';
import { ApiError, conflict, forbidden, pgConstraint } from '../common/errors';
import type { RenewalDto } from './dto';
import { ReadModel } from './read-model';

function deny(d: Denial): ApiError {
  return d === 'role_forbidden' || d === 'cannot_decide_own_request' ? forbidden(d) : conflict(d);
}

/**
 * State-changing commands. Lock order everywhere: request → resource → job.
 * No network calls inside transactions; the provider is reached only by the worker.
 */
@Injectable()
export class CommandsService {
  /** Test-only fault hook (rollback injection); never set outside tests. */
  static faultHook: ((point: string) => void) | null = null;

  constructor(
    @Inject(Sequelize) private readonly sequelize: Sequelize,
    private readonly read: ReadModel,
  ) {}

  private tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, fn);
  }

  private fault(point: string): void {
    CommandsService.faultHook?.(point);
  }

  async create(p: Principal, resourceId: string): Promise<RenewalDto> {
    await this.read.assertResourceInWorkspace(p, resourceId);
    if (!p.canInitiate) throw forbidden('role_forbidden');
    try {
      const id = await this.tx(async (transaction) => {
        // Lock serializes concurrent creates for this resource; the partial unique index is the final defense.
        const res = await Resource.findOne({
          where: { id: resourceId, workspaceId: p.workspaceId },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!res) throw forbidden('workspace_forbidden');
        const active = await RenewalRequest.count({
          where: { resourceId, status: { [Op.in]: [...ACTIVE_STATUSES] } },
          transaction,
        });
        const d = createDenial(p, active > 0);
        if (d) throw deny(d);
        // Snapshot from the locked row. ck_requests_term_30_days re-checks the date math in PostgreSQL.
        const created = await RenewalRequest.create(
          {
            id: this.sequelize.literal(`'RN-' || nextval('renewal_request_seq')`),
            workspaceId: p.workspaceId,
            resourceId,
            status: 'pending_approval',
            previousExpiresOn: res.expiresOn,
            newExpiresOn: addCalendarDays(res.expiresOn, RENEWAL_DAYS),
            amountMinor: res.amountMinor,
            currency: res.currency,
            idempotencyKey: `renewal:${randomUUID()}`,
            createdBy: p.userId,
          },
          { transaction, returning: ['id'] },
        );
        this.fault('create:after_insert');
        await appendAudit(transaction, {
          workspaceId: p.workspaceId,
          requestId: created.id,
          resourceId,
          actorId: p.userId,
          type: 'request_created',
          toStatus: 'pending_approval',
          detail: 'Заявка на продление на 30 календарных дней.',
        });
        return created.id;
      });
      return this.read.renewal(p, id);
    } catch (err) {
      if (pgConstraint(err) === 'uq_renewal_active_resource') throw conflict('active_renewal_exists');
      throw err;
    }
  }

  private async lockRequest(p: Principal, id: string, transaction: Transaction): Promise<RenewalRequest> {
    const req = await RenewalRequest.findOne({
      where: { id, workspaceId: p.workspaceId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!req) throw forbidden('workspace_forbidden');
    return req;
  }

  /** Conditional transition: UPDATE ... WHERE id AND status = from; exactly one row or 409. */
  private async transition(
    transaction: Transaction,
    id: string,
    from: RenewalStatusValue,
    values: Partial<RenewalRequest>,
  ): Promise<void> {
    const [count] = await RenewalRequest.update(
      { ...values, updatedAt: this.sequelize.fn('now') },
      { where: { id, status: from }, transaction },
    );
    if (count !== 1) throw conflict('invalid_status_transition');
  }

  async approve(p: Principal, id: string): Promise<RenewalDto> {
    await this.read.assertRequestInWorkspace(p, id);
    await this.tx(async (transaction) => {
      const req = await this.lockRequest(p, id, transaction);
      const d = decisionDenial(p, { createdBy: req.createdBy, status: req.status });
      if (d) throw deny(d);
      const res = await Resource.findOne({
        where: { id: req.resourceId, workspaceId: p.workspaceId },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const snapshot = { previousExpiresOn: req.previousExpiresOn, amountMinor: req.amountMinor, currency: req.currency };
      if (!res || !snapshotMatches(snapshot, res)) throw conflict('resource_changed');

      await this.transition(transaction, id, 'pending_approval', {
        status: 'processing',
        decidedBy: p.userId,
        decidedAt: this.sequelize.fn('now') as unknown as Date,
        providerConfirmation: 'pending',
      });
      // Durable job: payload copied from the immutable snapshot, never from the live resource.
      const payload = providerPayload(req);
      await RenewalJob.create(
        {
          id: randomUUID(),
          requestId: id,
          payloadResourceId: payload.resource_id,
          payloadPeriodMonths: payload.period_months,
          payloadAmountMinor: payload.amount_minor,
          payloadCurrency: payload.currency,
          status: 'queued',
          phase: 'post',
        },
        { transaction },
      );
      this.fault('approve:after_job');
      const base = { workspaceId: p.workspaceId, requestId: id, resourceId: req.resourceId };
      await appendAudit(transaction, {
        ...base,
        actorId: p.userId,
        type: 'request_approved',
        fromStatus: 'pending_approval',
        toStatus: 'processing',
        detail: 'Решение согласующего зафиксировано.',
      });
      this.fault('approve:after_audit');
      await appendAudit(transaction, {
        ...base,
        actorId: null,
        type: 'job_enqueued',
        result: 'В очереди',
        detail: 'Операция передана фоновому обработчику с ключом заявки.',
      });
    });
    return this.read.renewal(p, id);
  }

  async reject(p: Principal, id: string): Promise<RenewalDto> {
    await this.read.assertRequestInWorkspace(p, id);
    await this.tx(async (transaction) => {
      const req = await this.lockRequest(p, id, transaction);
      const d = decisionDenial(p, { createdBy: req.createdBy, status: req.status });
      if (d) throw deny(d);
      await this.transition(transaction, id, 'pending_approval', {
        status: 'rejected',
        decidedBy: p.userId,
        decidedAt: this.sequelize.fn('now') as unknown as Date,
      });
      await appendAudit(transaction, {
        workspaceId: p.workspaceId,
        requestId: id,
        resourceId: req.resourceId,
        actorId: p.userId,
        type: 'request_rejected',
        fromStatus: 'pending_approval',
        toStatus: 'rejected',
        detail: 'Срок ресурса не изменён, операция провайдеру не отправлялась.',
      });
    });
    return this.read.renewal(p, id);
  }

  async retry(p: Principal, id: string): Promise<RenewalDto> {
    await this.read.assertRequestInWorkspace(p, id);
    await this.tx(async (transaction) => {
      const req = await this.lockRequest(p, id, transaction);
      const d = retryDenial(p, { status: req.status });
      if (d) throw deny(d);
      const job = await RenewalJob.findOne({ where: { requestId: id }, lock: transaction.LOCK.UPDATE, transaction });
      if (!job) throw conflict('invalid_status_transition');
      await this.transition(transaction, id, 'requires_attention', {
        status: 'processing',
        attentionReason: null,
        // Known provider evidence is preserved; otherwise the outcome is uncertain until GET.
        providerConfirmation: req.providerConfirmation === 'confirmed' ? 'confirmed' : 'uncertain',
      });
      // Same job, same key and payload; new cycle starts with GET. Any old lease is fenced off.
      await RenewalJob.update(
        {
          status: 'queued',
          phase: 'check',
          postAttempts: 0,
          checkAttempts: 0,
          leaseToken: this.sequelize.literal('lease_token + 1') as unknown as string,
          leaseUntil: null,
          nextRunAt: this.sequelize.fn('now') as unknown as Date,
          lastErrorCode: null,
          updatedAt: this.sequelize.fn('now') as unknown as Date,
        },
        { where: { id: job.id }, transaction },
      );
      await appendAudit(transaction, {
        workspaceId: p.workspaceId,
        requestId: id,
        resourceId: req.resourceId,
        actorId: p.userId,
        type: 'retry_requested',
        fromStatus: 'requires_attention',
        toStatus: 'processing',
        detail: 'Повторная обработка с тем же ключом операции: сначала проверка результата по GET.',
      });
    });
    return this.read.renewal(p, id);
  }
}
