import { Injectable } from '@nestjs/common';
import { Op, type Includeable, type Order, type Transaction, type WhereOptions } from 'sequelize';
import {
  AuditEvent,
  RenewalJob,
  RenewalRequest,
  Resource,
  User,
} from '../../database/models';
import { ACTIVE_STATUSES, RENEWAL_STATUSES, type RenewalStatusValue } from '../../domain/renewal-rules';
import type { Principal } from '../auth/principal';
import { forbidden, notFound } from '../common/errors';
import type {
  AuditEventDto,
  AuditListDto,
  AuditListQuery,
  RenewalDto,
  RenewalListDto,
  RenewalListQuery,
  ResourceDto,
  ResourceListDto,
  ResourceListQuery,
} from './dto';

/* Every query below is scoped by the caller's workspace_id from the session. */

const iso = (v: Date | string | null | undefined): string | null => (v == null ? null : new Date(v).toISOString());

const RENEWAL_INCLUDE: Includeable[] = [
  { model: Resource, as: 'resource', attributes: ['name', 'category'] },
  { model: User, as: 'creator', attributes: ['name'] },
  { model: User, as: 'decider', attributes: ['name'] },
  {
    model: RenewalJob,
    as: 'job',
    attributes: ['status', 'postAttempts', 'postAttemptsTotal', 'lastAttemptAt', 'nextRunAt'],
  },
];

const ACTIVE_INCLUDE: Includeable = {
  model: RenewalRequest,
  as: 'activeRequest',
  attributes: ['id', 'status'],
  required: false,
};

const AUDIT_INCLUDE: Includeable[] = [
  { model: User, as: 'actor', attributes: ['name'] },
  { model: Resource, as: 'resource', attributes: ['name'] },
];

export function toRenewalDto(r: RenewalRequest): RenewalDto {
  const job = r.job ?? null;
  const scheduled = job && (job.status === 'queued' || job.status === 'leased');
  return {
    id: r.id,
    resource_id: r.resourceId,
    resource_name: r.resource?.name ?? '',
    workspace_id: r.workspaceId,
    category: r.resource?.category ?? '',
    previous_expires_on: r.previousExpiresOn,
    new_expires_on: r.newExpiresOn,
    amount_minor: Number(r.amountMinor),
    currency: 'RUB',
    status: r.status,
    idempotency_key: r.idempotencyKey,
    created_by: r.createdBy,
    created_by_name: r.creator?.name ?? '',
    created_at: iso(r.createdAt)!,
    decided_by: r.decidedBy ?? null,
    decided_by_name: r.decider?.name ?? null,
    decided_at: iso(r.decidedAt),
    post_attempts: job?.postAttempts ?? 0,
    post_attempts_total: job?.postAttemptsTotal ?? 0,
    last_attempt_at: iso(job?.lastAttemptAt),
    next_check_at: scheduled ? iso(job.nextRunAt) : null,
    provider_confirmation: r.providerConfirmation,
    operation_id: r.operationId ?? null,
    attention_reason: r.attentionReason ?? null,
    fixture_origin: r.fixtureOrigin ?? null,
  };
}

export function toResourceDto(r: Resource): ResourceDto {
  const active = r.activeRequest ?? null;
  return {
    id: r.id,
    workspace_id: r.workspaceId,
    name: r.name,
    category: r.category,
    expires_on: r.expiresOn,
    amount_minor: Number(r.amountMinor),
    currency: 'RUB',
    active_request: active ? { id: active.id, status: active.status } : null,
  };
}

export function toAuditDto(e: AuditEvent): AuditEventDto {
  return {
    id: `ev-${e.id}`,
    workspace_id: e.workspaceId,
    request_id: e.requestId,
    resource_id: e.resourceId,
    resource_name: e.resource?.name ?? null,
    occurred_at: iso(e.occurredAt)!,
    type: e.type,
    actor_id: e.actorId ?? null,
    actor_name: e.actor?.name ?? null,
    from_status: e.fromStatus ?? null,
    to_status: e.toStatus ?? null,
    result: e.result ?? null,
    detail: e.detail,
    fixture_origin: e.fixtureOrigin ?? null,
  };
}

/** LIKE pattern with escaped wildcards (PostgreSQL's default LIKE escape is backslash). */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const RESOURCE_ORDER: Record<string, Order> = {
  expires_on: [['expiresOn', 'ASC'], ['id', 'ASC']],
  '-expires_on': [['expiresOn', 'DESC'], ['id', 'ASC']],
  amount_minor: [['amountMinor', 'ASC'], ['id', 'ASC']],
  '-amount_minor': [['amountMinor', 'DESC'], ['id', 'ASC']],
};

const NEWEST: Order = [['createdAt', 'DESC'], ['id', 'DESC']];

@Injectable()
export class ReadModel {
  /** 404 if the resource does not exist anywhere, 403 if it belongs to another workspace. */
  async assertResourceInWorkspace(p: Principal, resourceId: string, transaction?: Transaction): Promise<void> {
    const r = await Resource.findByPk(resourceId, { attributes: ['workspaceId'], transaction });
    if (!r) throw notFound('resource_not_found');
    if (r.workspaceId !== p.workspaceId) throw forbidden('workspace_forbidden');
  }

  async assertRequestInWorkspace(p: Principal, requestId: string, transaction?: Transaction): Promise<void> {
    const r = await RenewalRequest.findByPk(requestId, { attributes: ['workspaceId'], transaction });
    if (!r) throw notFound('request_not_found');
    if (r.workspaceId !== p.workspaceId) throw forbidden('workspace_forbidden');
  }

  async renewal(p: Principal, id: string, transaction?: Transaction): Promise<RenewalDto> {
    const r = await RenewalRequest.findOne({
      where: { id, workspaceId: p.workspaceId },
      include: RENEWAL_INCLUDE,
      transaction,
    });
    if (!r) throw notFound('request_not_found');
    return toRenewalDto(r);
  }

  async resource(p: Principal, id: string): Promise<ResourceDto> {
    const r = await Resource.findOne({ where: { id, workspaceId: p.workspaceId }, include: [ACTIVE_INCLUDE] });
    if (!r) throw notFound('resource_not_found');
    return toResourceDto(r);
  }

  async resourceRequests(p: Principal, resourceId: string): Promise<RenewalDto[]> {
    const rows = await RenewalRequest.findAll({
      where: { workspaceId: p.workspaceId, resourceId },
      include: RENEWAL_INCLUDE,
      order: NEWEST,
    });
    return rows.map(toRenewalDto);
  }

  async requestEvents(p: Principal, requestId: string): Promise<AuditEventDto[]> {
    const rows = await AuditEvent.findAll({
      where: { workspaceId: p.workspaceId, requestId },
      include: AUDIT_INCLUDE,
      order: [['occurredAt', 'ASC'], ['id', 'ASC']],
    });
    return rows.map(toAuditDto);
  }

  async listResources(p: Principal, q: ResourceListQuery): Promise<ResourceListDto> {
    const where: WhereOptions[] = [{ workspaceId: p.workspaceId }];
    if (q.q) {
      const pattern = likePattern(q.q);
      where.push({ [Op.or]: [{ name: { [Op.iLike]: pattern } }, { id: { [Op.iLike]: pattern } }] });
    }
    if (q.category) where.push({ category: q.category });
    if (q.has_active === 'true') where.push({ '$activeRequest.id$': { [Op.ne]: null } });
    if (q.has_active === 'false') where.push({ '$activeRequest.id$': null });
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const [page, categories, workspaceTotal] = await Promise.all([
      Resource.findAndCountAll({
        where: { [Op.and]: where },
        include: [ACTIVE_INCLUDE],
        order: RESOURCE_ORDER[q.sort ?? 'expires_on'],
        limit,
        offset,
        subQuery: false,
        distinct: true,
      }),
      Resource.findAll({
        where: { workspaceId: p.workspaceId },
        attributes: ['category'],
        group: ['category'],
        order: [['category', 'ASC']],
      }),
      Resource.count({ where: { workspaceId: p.workspaceId } }),
    ]);
    return {
      items: page.rows.map(toResourceDto),
      total: page.count,
      limit,
      offset,
      categories: categories.map((c) => c.category),
      workspace_total: workspaceTotal,
    };
  }

  async listRenewals(p: Principal, q: RenewalListQuery): Promise<RenewalListDto> {
    const where: WhereOptions[] = [{ workspaceId: p.workspaceId }];
    if (q.q) {
      const pattern = likePattern(q.q);
      where.push({
        [Op.or]: [
          { id: { [Op.iLike]: pattern } },
          { '$resource.name$': { [Op.iLike]: pattern } },
          { '$creator.name$': { [Op.iLike]: pattern } },
        ],
      });
    }
    if (q.status) where.push({ status: q.status });
    const order: Order = q.sort === 'created_at' ? [['createdAt', 'ASC'], ['id', 'ASC']] : NEWEST;
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const [page, counts] = await Promise.all([
      RenewalRequest.findAndCountAll({
        where: { [Op.and]: where },
        include: RENEWAL_INCLUDE,
        order,
        limit,
        offset,
        subQuery: false,
        distinct: true,
      }),
      this.statusCounts(p.workspaceId),
    ]);
    return {
      items: page.rows.map(toRenewalDto),
      total: page.count,
      limit,
      offset,
      counts,
      workspace_total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  async statusCounts(workspaceId: string): Promise<Record<RenewalStatusValue, number>> {
    const grouped = (await RenewalRequest.count({
      where: { workspaceId },
      group: ['status'],
    })) as unknown as { status: RenewalStatusValue; count: number | string }[];
    const counts = Object.fromEntries(RENEWAL_STATUSES.map((s) => [s, 0])) as Record<RenewalStatusValue, number>;
    for (const g of grouped) counts[g.status] = Number(g.count);
    return counts;
  }

  async listAudit(p: Principal, q: AuditListQuery): Promise<AuditListDto> {
    const where: WhereOptions<AuditEvent> = { workspaceId: p.workspaceId };
    if (q.resource_id) {
      await this.assertResourceInWorkspace(p, q.resource_id);
      Object.assign(where, { resourceId: q.resource_id });
    }
    if (q.type) Object.assign(where, { type: q.type });
    if (q.from || q.to) {
      Object.assign(where, {
        occurredAt: {
          ...(q.from ? { [Op.gte]: new Date(q.from) } : {}),
          ...(q.to ? { [Op.lt]: new Date(q.to) } : {}),
        },
      });
    }
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const page = await AuditEvent.findAndCountAll({
      where,
      include: AUDIT_INCLUDE,
      order: [['occurredAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
    return { items: page.rows.map(toAuditDto), total: page.count, limit, offset };
  }

  async overviewParts(p: Principal) {
    const ws = { workspaceId: p.workspaceId };
    const [resourcesTotal, counts, awaiting, mine, recent, expiring, events] = await Promise.all([
      Resource.count({ where: ws }),
      this.statusCounts(p.workspaceId),
      p.canApprove
        ? RenewalRequest.findAll({
            where: {
              ...ws,
              [Op.or]: [
                { status: 'pending_approval', createdBy: { [Op.ne]: p.userId } },
                { status: 'requires_attention' },
              ],
            },
            include: RENEWAL_INCLUDE,
            order: NEWEST,
            limit: 20,
          })
        : Promise.resolve([] as RenewalRequest[]),
      p.canInitiate
        ? RenewalRequest.findAll({
            where: { ...ws, createdBy: p.userId, status: { [Op.in]: [...ACTIVE_STATUSES] } },
            include: RENEWAL_INCLUDE,
            order: NEWEST,
            limit: 20,
          })
        : Promise.resolve([] as RenewalRequest[]),
      RenewalRequest.findAll({ where: ws, include: RENEWAL_INCLUDE, order: NEWEST, limit: 5 }),
      Resource.findAll({
        where: ws,
        include: [ACTIVE_INCLUDE],
        order: RESOURCE_ORDER.expires_on,
        limit: 5,
      }),
      AuditEvent.findAll({ where: ws, include: AUDIT_INCLUDE, order: [['occurredAt', 'DESC'], ['id', 'DESC']], limit: 6 }),
    ]);
    return {
      workspace_id: p.workspaceId,
      counts: {
        resources_total: resourcesTotal,
        pending_approval: counts.pending_approval,
        processing: counts.processing,
        requires_attention: counts.requires_attention,
      },
      awaiting_my_decision: awaiting.map(toRenewalDto),
      my_active_requests: mine.map(toRenewalDto),
      recent_requests: recent.map(toRenewalDto),
      expiring_resources: expiring.map(toResourceDto),
      recent_events: events.map(toAuditDto),
    };
  }
}
