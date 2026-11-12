import type { Transaction } from 'sequelize';
import { AuditEvent } from './models';

export interface AuditInput {
  workspaceId: string;
  requestId: string;
  resourceId: string;
  actorId: string | null; // null = system (worker)
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  result?: string | null;
  detail: string;
}

/** Append-only audit write; always inside the caller's transaction. occurred_at is the DB clock default. */
export async function appendAudit(transaction: Transaction, e: AuditInput): Promise<void> {
  await AuditEvent.create(
    {
      workspaceId: e.workspaceId,
      requestId: e.requestId,
      resourceId: e.resourceId,
      actorId: e.actorId,
      type: e.type,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      result: e.result ?? null,
      detail: e.detail,
    },
    { transaction },
  );
}
