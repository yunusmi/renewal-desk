export interface User {
  id: string;
  name: string;
  email: string;
  workspace_id: string;
  workspace_name: string;
  roles: string[];
}
export type Status =
  'pending_approval' | 'processing' | 'completed' | 'rejected' | 'requires_attention';
export interface Resource {
  id: string;
  name: string;
  category: string;
  workspace_id: string;
  expires_on: string;
  amount_minor: number;
  currency: string;
  active_request: { id: string; status: Status } | null;
}
export interface Renewal {
  id: string;
  resource_id: string;
  resource_name: string;
  category: string;
  workspace_id: string;
  previous_expires_on: string;
  new_expires_on: string;
  amount_minor: number;
  currency: string;
  status: Status;
  created_by: string;
  created_by_name: string;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  post_attempts: number;
  post_attempts_total: number;
  last_attempt_at: string | null;
  next_check_at: string | null;
  idempotency_key: string;
  provider_confirmation: string;
  operation_id: string | null;
  attention_reason: string | null;
  fixture_origin: string | null;
}
export interface Audit {
  id: string;
  resource_id: string;
  resource_name: string | null;
  request_id: string;
  occurred_at: string;
  type: string;
  actor_name: string | null;
  from_status: Status | null;
  to_status: Status | null;
  result: string | null;
  detail: string;
  fixture_origin: string | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  workspace_total?: number;
}
export interface ResourcePage extends Page<Resource> {
  categories: string[];
}
export interface RenewalPage extends Page<Renewal> {
  counts: Record<Status, number>;
}
export interface Detail {
  request: Renewal;
  resource: Resource;
  events: Audit[];
}
export interface Overview {
  counts: {
    resources_total: number;
    pending_approval: number;
    processing: number;
    requires_attention: number;
  };
  awaiting_my_decision: Renewal[];
  my_active_requests: Renewal[];
  recent_requests: Renewal[];
  expiring_resources: Resource[];
  recent_events: Audit[];
}
export class ApiError extends Error {
  constructor(
    readonly status_code: number,
    readonly error_code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrf: string | null = null;
export function clearSession() {
  csrf = null;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined && !path.startsWith('/auth/login') && !csrf) {
    csrf = (await api<{ csrf_token: string }>('/auth/csrf')).csrf_token;
  }
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? {}
        : { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      if (!['/auth/login', '/auth/me'].includes(path))
        window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(
      response.status,
      value.error_code ?? 'request_failed',
      value.message ?? 'Не удалось выполнить запрос',
    );
  }
  return value as T;
}
export function query(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return `?${q}`;
}
export const labels: Record<Status, string> = {
  pending_approval: 'На согласовании',
  processing: 'Выполняется',
  completed: 'Завершена',
  rejected: 'Отклонена',
  requires_attention: 'Требует внимания',
};
export const date = (v: string) => v.split('-').reverse().join('.');
export const time = (v: string | null) => (v ? new Date(v).toLocaleString('ru-RU') : '—');
export const money = (v: number) =>
  `${(v / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RUB`;
