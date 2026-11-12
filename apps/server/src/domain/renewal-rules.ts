/**
 * Pure business rules. The server enforces them inside transactions; the same
 * predicates drive UI hints. Unit-tested in renewal-rules.spec.ts.
 */

export const RENEWAL_DAYS = 30;
export const PROVIDER_PERIOD_MONTHS = 1;
export const MAX_POST_ATTEMPTS = 3;

export const RENEWAL_STATUSES = [
  'pending_approval',
  'processing',
  'completed',
  'rejected',
  'requires_attention',
] as const;
export type RenewalStatusValue = (typeof RENEWAL_STATUSES)[number];
export const ACTIVE_STATUSES: readonly RenewalStatusValue[] = [
  'pending_approval',
  'processing',
  'requires_attention',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Adds calendar days to a date-only ISO string using UTC arithmetic (no local TZ, no DST shift). */
export function addCalendarDays(isoDate: string, days: number): string {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new Error(`invalid ISO date: ${isoDate}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== isoDate)
    throw new Error(`invalid calendar date: ${isoDate}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface Actor {
  userId: string;
  canInitiate: boolean;
  canApprove: boolean;
}

export type Denial =
  | 'role_forbidden'
  | 'cannot_decide_own_request'
  | 'invalid_status_transition'
  | 'active_renewal_exists';

export function createDenial(actor: Actor, hasActiveRequest: boolean): Denial | null {
  if (!actor.canInitiate) return 'role_forbidden';
  if (hasActiveRequest) return 'active_renewal_exists';
  return null;
}

/** Approve and reject share the same rule; own requests are never decidable. */
export function decisionDenial(
  actor: Actor,
  req: { createdBy: string; status: RenewalStatusValue },
): Denial | null {
  if (!actor.canApprove) return 'role_forbidden';
  if (req.createdBy === actor.userId) return 'cannot_decide_own_request';
  if (req.status !== 'pending_approval') return 'invalid_status_transition';
  return null;
}

/**
 * Retry re-runs an already approved job with the same key. The own-request ban
 * applies to decisions, not to retry (the request was approved by someone else).
 */
export function retryDenial(actor: Actor, req: { status: RenewalStatusValue }): Denial | null {
  if (!actor.canApprove) return 'role_forbidden';
  if (req.status !== 'requires_attention') return 'invalid_status_transition';
  return null;
}

export interface Snapshot {
  previousExpiresOn: string;
  amountMinor: number;
  currency: string;
}
export interface ResourceState {
  expiresOn: string;
  amountMinor: number;
  currency: string;
}

export function snapshotMatches(s: Snapshot, r: ResourceState): boolean {
  return (
    s.previousExpiresOn === r.expiresOn &&
    s.amountMinor === r.amountMinor &&
    s.currency === r.currency
  );
}

/** Exact 4-field provider payload, built only from the immutable request snapshot. */
export function providerPayload(s: { resourceId: string; amountMinor: number; currency: string }) {
  return {
    resource_id: s.resourceId,
    period_months: PROVIDER_PERIOD_MONTHS,
    amount_minor: s.amountMinor,
    currency: s.currency,
  };
}
