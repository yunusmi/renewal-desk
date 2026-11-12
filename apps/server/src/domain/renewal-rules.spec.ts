import {
  addCalendarDays,
  createDenial,
  decisionDenial,
  providerPayload,
  retryDenial,
  snapshotMatches,
} from './renewal-rules';

describe('addCalendarDays', () => {
  it.each([
    ['2027-03-01', '2027-03-31'], // control scenario
    ['2027-05-20', '2027-06-19'],
    ['2027-06-01', '2027-07-01'],
    ['2027-01-31', '2027-03-02'], // not "+1 month"
    ['2028-02-15', '2028-03-16'], // leap year
    ['2027-02-15', '2027-03-17'],
    ['2026-12-20', '2027-01-19'], // year boundary
    ['2027-03-27', '2027-04-26'], // across European DST change
    ['2027-10-30', '2027-11-29'],
  ])('%s + 30 = %s', (from, to) => {
    expect(addCalendarDays(from, 30)).toBe(to);
  });

  it('is independent of process timezone', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      expect(addCalendarDays('2027-03-01', 30)).toBe('2027-03-31');
    } finally {
      process.env.TZ = prev;
    }
  });

  it.each(['2027-02-30', '2027-3-01', '01.03.2027', ''])('rejects invalid date %p', (d) => {
    expect(() => addCalendarDays(d, 30)).toThrow();
  });
});

const initiator = { userId: 'u-ini-a', canInitiate: true, canApprove: false };
const approver = { userId: 'u-apr-a', canInitiate: false, canApprove: true };
const universal = { userId: 'u-uni-a', canInitiate: true, canApprove: true };

describe('permissions', () => {
  it('create: only initiators, one active request', () => {
    expect(createDenial(initiator, false)).toBeNull();
    expect(createDenial(universal, false)).toBeNull();
    expect(createDenial(approver, false)).toBe('role_forbidden');
    expect(createDenial(initiator, true)).toBe('active_renewal_exists');
  });

  it('decision: approver of another author on pending only', () => {
    const pending = { createdBy: 'u-ini-a', status: 'pending_approval' as const };
    expect(decisionDenial(approver, pending)).toBeNull();
    expect(decisionDenial(universal, pending)).toBeNull();
    expect(decisionDenial(initiator, pending)).toBe('role_forbidden');
    expect(decisionDenial(universal, { ...pending, createdBy: 'u-uni-a' })).toBe('cannot_decide_own_request');
    expect(decisionDenial(approver, { ...pending, status: 'processing' })).toBe('invalid_status_transition');
    expect(decisionDenial(approver, { ...pending, status: 'completed' })).toBe('invalid_status_transition');
  });

  it('retry: approver on requires_attention only', () => {
    expect(retryDenial(approver, { status: 'requires_attention' })).toBeNull();
    expect(retryDenial(universal, { status: 'requires_attention' })).toBeNull();
    expect(retryDenial(initiator, { status: 'requires_attention' })).toBe('role_forbidden');
    expect(retryDenial(approver, { status: 'processing' })).toBe('invalid_status_transition');
  });
});

describe('snapshot and payload', () => {
  const snap = { previousExpiresOn: '2027-03-01', amountMinor: 128000, currency: 'RUB' };
  it('detects expiry, amount or currency drift', () => {
    expect(snapshotMatches(snap, { expiresOn: '2027-03-01', amountMinor: 128000, currency: 'RUB' })).toBe(true);
    expect(snapshotMatches(snap, { expiresOn: '2027-03-31', amountMinor: 128000, currency: 'RUB' })).toBe(false);
    expect(snapshotMatches(snap, { expiresOn: '2027-03-01', amountMinor: 128001, currency: 'RUB' })).toBe(false);
    expect(snapshotMatches(snap, { expiresOn: '2027-03-01', amountMinor: 128000, currency: 'USD' })).toBe(false);
  });

  it('builds exactly the 4 provider fields', () => {
    const p = providerPayload({ resourceId: 'res-a-01', amountMinor: 128000, currency: 'RUB' });
    expect(p).toEqual({ resource_id: 'res-a-01', period_months: 1, amount_minor: 128000, currency: 'RUB' });
    expect(Object.keys(p).sort()).toEqual(['amount_minor', 'currency', 'period_months', 'resource_id']);
  });
});
