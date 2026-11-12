import type { WorkerConfig } from '../config/env';
import type { RenewalJob } from '../database/models';

export interface Confirmation {
  operation_id: string;
  status: 'completed';
  started_count: 1;
  resource_id: string;
  period_months: 1;
  amount_minor: number;
  currency: string;
}
export type ProviderResult =
  | { kind: 'confirmed'; confirmation: Confirmation }
  | { kind: 'transient'; code: string }
  | { kind: 'permanent'; code: string };

export function validConfirmation(value: unknown, job: RenewalJob): value is Confirmation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.operation_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.operation_id) &&
    v.status === 'completed' &&
    v.started_count === 1 &&
    v.resource_id === job.payloadResourceId &&
    v.period_months === 1 &&
    v.amount_minor === job.payloadAmountMinor &&
    v.currency === job.payloadCurrency
  );
}

export class ProviderClient {
  constructor(private readonly cfg: WorkerConfig) {}

  async call(method: 'GET' | 'POST', key: string, job: RenewalJob): Promise<ProviderResult> {
    try {
      const response = await fetch(
        `${this.cfg.providerBaseUrl}/renewals${method === 'GET' ? `/${encodeURIComponent(key)}` : ''}`,
        {
          method,
          redirect: 'manual',
          signal: AbortSignal.timeout(this.cfg.providerTimeoutMs),
          headers:
            method === 'POST' ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {},
          body:
            method === 'POST'
              ? JSON.stringify({
                  resource_id: job.payloadResourceId,
                  period_months: job.payloadPeriodMonths,
                  amount_minor: job.payloadAmountMinor,
                  currency: job.payloadCurrency,
                })
              : undefined,
        },
      );
      if (response.status === 200) {
        // A successful HTTP status alone never proves the external effect.
        const value: unknown = await response.json().catch(() => null);
        return validConfirmation(value, job)
          ? { kind: 'confirmed', confirmation: value }
          : { kind: 'permanent', code: 'provider_invalid_response' };
      }
      await response.body?.cancel();
      if (
        response.status >= 500 ||
        response.status === 429 ||
        (method === 'GET' && response.status === 404)
      ) {
        return { kind: 'transient', code: `provider_http_${response.status}` };
      }
      return {
        kind: 'permanent',
        code: response.status === 409 ? 'provider_key_conflict' : 'provider_rejected',
      };
    } catch {
      return { kind: 'transient', code: 'provider_unavailable' };
    }
  }
}
