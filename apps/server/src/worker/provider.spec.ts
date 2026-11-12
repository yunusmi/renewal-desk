import type { RenewalJob } from '../database/models';
import { validConfirmation } from './provider';
const job = {
  payloadResourceId: 'res-a-01',
  payloadAmountMinor: 128000,
  payloadCurrency: 'RUB',
} as RenewalJob;
const valid = {
  operation_id: 'e9713140-60bd-4ef7-a357-8c68f50ca5e8',
  status: 'completed',
  started_count: 1,
  resource_id: 'res-a-01',
  period_months: 1,
  amount_minor: 128000,
  currency: 'RUB',
};
test('valid complete provider evidence matches the immutable payload', () =>
  expect(validConfirmation(valid, job)).toBe(true));
test.each([
  null,
  [],
  {},
  { ...valid, operation_id: 'op-123' },
  { ...valid, started_count: 2 },
  { ...valid, started_count: '1' },
  { ...valid, status: 'processing' },
  { ...valid, resource_id: 'res-b-01' },
  { ...valid, period_months: '1' },
  { ...valid, period_months: 2 },
  { ...valid, amount_minor: '128000' },
  { ...valid, amount_minor: 128001 },
  { ...valid, currency: 'USD' },
])('rejects invalid provider evidence %j', (value) =>
  expect(validConfirmation(value, job)).toBe(false),
);
