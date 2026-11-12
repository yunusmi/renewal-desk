import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  date,
  labels,
  money,
  query,
  time,
  type Audit,
  type Detail,
  type Overview,
  type Page,
  type Renewal,
  type RenewalPage,
  type Resource,
  type ResourcePage,
  type Status,
} from './api/client';
import {
  Empty,
  ErrorState,
  eventLabels,
  Loading,
  Modal,
  Pager,
  RenewalTable,
  StatusChip,
  Timeline,
} from './components/common';
import { cache, useUser } from './state';
const poll = 2500;
function Heading({ children }: { children: string }) {
  const user = useUser();
  return (
    <div className="heading">
      <h1 tabIndex={-1}>{children}</h1>
      <p>Рабочее пространство: {user.workspace_name}</p>
    </div>
  );
}
async function refresh() {
  await cache.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
}
function ResourceDrawer({
  id,
  close,
  create,
}: {
  id: string;
  close: () => void;
  create: (id: string) => void;
}) {
  const user = useUser();
  const data = useQuery({
    queryKey: ['resource', id],
    queryFn: () =>
      api<{ resource: Resource; requests: Renewal[] }>(`/resources/${encodeURIComponent(id)}`),
    refetchInterval: poll,
  });
  return (
    <Modal title={data.data?.resource.name ?? 'Ресурс'} close={close} drawer>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : (
        data.data && (
          <div className="stack">
            <code>{id}</code>
            <dl>
              <dt>Категория</dt>
              <dd>{data.data.resource.category}</dd>
              <dt>Текущий срок</dt>
              <dd>{date(data.data.resource.expires_on)}</dd>
              <dt>Стоимость</dt>
              <dd>{money(data.data.resource.amount_minor)}</dd>
            </dl>
            {data.data.resource.active_request ? (
              <p>
                Есть активная заявка{' '}
                <Link to={`/requests/${data.data.resource.active_request.id}`} onClick={close}>
                  {data.data.resource.active_request.id}
                </Link>
                . Новую можно создать после её завершения или отклонения.
              </p>
            ) : user.roles.includes('initiator') ? (
              <button className="primary" onClick={() => create(id)}>
                Создать заявку на +30 дней
              </button>
            ) : (
              <p className="muted">Создавать заявки может только инициатор.</p>
            )}
            <h3>История заявок</h3>
            {data.data.requests.length ? (
              data.data.requests.map((r) => (
                <div className="list-item" key={r.id}>
                  <Link to={`/requests/${r.id}`} onClick={close}>
                    {r.id}
                  </Link>
                  <StatusChip status={r.status} />
                  <span>
                    {date(r.previous_expires_on)} → {date(r.new_expires_on)}
                  </span>
                </div>
              ))
            ) : (
              <Empty>Заявок пока нет</Empty>
            )}
          </div>
        )
      )}
    </Modal>
  );
}
function CreateDialog({ initial, close }: { initial?: string; close: () => void }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const resources = useQuery({
    queryKey: ['create-resources'],
    queryFn: () => api<ResourcePage>('/resources?limit=100'),
  });
  const r = resources.data?.items.find((r) => r.id === selected);
  const preview = r ? new Date(`${r.expires_on}T00:00:00Z`) : null;
  if (preview) preview.setUTCDate(preview.getUTCDate() + 30);
  async function submit() {
    if (!r || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<Renewal>(`/resources/${encodeURIComponent(r.id)}/renewals`, {});
      await refresh();
      close();
      navigate(`/requests/${result.id}`);
    } catch (err) {
      setError(err);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Создать заявку" close={close}>
      <div className="stack">
        {resources.error ? (
          <ErrorState error={resources.error} retry={() => void resources.refetch()} />
        ) : (
          <>
            <label>
              Ресурс
              <select aria-label="Ресурс" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Выберите ресурс</option>
                {resources.data?.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.active_request ? ` · ${r.active_request.id}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {r && (
              <>
                <div className="term">
                  <span>{date(r.expires_on)}</span>
                  <span>+30 дней →</span>
                  <strong>{date(preview!.toISOString().slice(0, 10))}</strong>
                </div>
                <p>Стоимость: {money(r.amount_minor)}</p>
                <p className="muted">
                  Срок изменится после согласования и подтверждения провайдером.
                </p>
                {r.active_request && (
                  <p role="alert">
                    У ресурса есть активная заявка{' '}
                    <Link to={`/requests/${r.active_request.id}`} onClick={close}>
                      {r.active_request.id}
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
          </>
        )}
        {error != null && <ErrorState error={error} />}
        <div className="actions right">
          <button data-cancel onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={!r || !!r.active_request || busy} onClick={submit}>
            {busy ? 'Создаём…' : 'Создать заявку'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
export function ResourcesPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<string>();
  const [create, setCreate] = useState<string>();
  const set = (k: string, v: string) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      if (k !== 'offset') p.delete('offset');
      return p;
    });
  const data = useQuery({
    queryKey: ['resources', params.toString()],
    queryFn: () => api<ResourcePage>(`/resources?${params}`),
    refetchInterval: poll,
  });
  return (
    <>
      <Heading>Ресурсы</Heading>
      <section className="card">
        <div className="toolbar">
          <input
            aria-label="Поиск ресурсов"
            placeholder="Поиск по названию или ID"
            value={params.get('q') ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
          <select
            aria-label="Категория"
            value={params.get('category') ?? ''}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="">Все категории</option>
            {data.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Наличие активной заявки"
            value={params.get('has_active') ?? ''}
            onChange={(e) => set('has_active', e.target.value)}
          >
            <option value="">Все ресурсы</option>
            <option value="true">С активной заявкой</option>
            <option value="false">Без активной заявки</option>
          </select>
          <select
            aria-label="Сортировка ресурсов"
            value={params.get('sort') ?? 'expires_on'}
            onChange={(e) => set('sort', e.target.value)}
          >
            <option value="expires_on">Ближайший срок</option>
            <option value="-expires_on">Дальний срок</option>
            <option value="amount_minor">Сначала дешевле</option>
            <option value="-amount_minor">Сначала дороже</option>
          </select>
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : (
          data.data && (
            <>
              <p className="muted" role="status">
                Найдено: {data.data.total} из {data.data.workspace_total}
              </p>
              {!data.data.items.length ? (
                <>
                  <Empty>{params.size ? 'Ничего не найдено' : 'В пространстве нет ресурсов'}</Empty>
                  {params.size > 0 && (
                    <button onClick={() => setParams({})}>Сбросить фильтры</button>
                  )}
                </>
              ) : (
                <div className="table-wrap">
                  <table className="responsive">
                    <thead>
                      <tr>
                        <th>Ресурс</th>
                        <th>Категория</th>
                        <th>Срок</th>
                        <th>Стоимость</th>
                        <th>Заявка</th>
                        <th>Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.items.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button className="text resource-title" onClick={() => setDrawer(r.id)}>
                              {r.name}
                            </button>
                            <small>
                              <code>{r.id}</code>
                            </small>
                          </td>
                          <td>{r.category}</td>
                          <td>{date(r.expires_on)}</td>
                          <td>{money(r.amount_minor)}</td>
                          <td>
                            {r.active_request ? (
                              <StatusChip status={r.active_request.status} />
                            ) : (
                              <span className="muted">Нет активной</span>
                            )}
                          </td>
                          <td>
                            {r.active_request ? (
                              <Link to={`/requests/${r.active_request.id}`}>
                                Открыть {r.active_request.id}
                              </Link>
                            ) : user.roles.includes('initiator') ? (
                              <button onClick={() => setCreate(r.id)}>Продлить</button>
                            ) : (
                              'Только просмотр'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager
                total={data.data.total}
                offset={Number(params.get('offset') ?? 0)}
                change={(n) => set('offset', String(n))}
              />
            </>
          )
        )}
      </section>
      {drawer && (
        <ResourceDrawer
          id={drawer}
          close={() => setDrawer(undefined)}
          create={(id) => {
            setDrawer(undefined);
            setCreate(id);
          }}
        />
      )}
      {create && <CreateDialog initial={create} close={() => setCreate(undefined)} />}
    </>
  );
}
export function RequestsPage() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const [create, setCreate] = useState(false);
  const set = (k: string, v: string) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      if (k !== 'offset') p.delete('offset');
      return p;
    });
  const data = useQuery({
    queryKey: ['requests', params.toString()],
    queryFn: () => api<RenewalPage>(`/renewals?${params}`),
    refetchInterval: poll,
  });
  return (
    <>
      <Heading>Заявки на продление</Heading>
      <section className="card">
        {data.data && (
          <div className="stats-line">
            <span>Всего: {data.data.workspace_total}</span>
            <span>Ожидают: {data.data.counts.pending_approval}</span>
            <span>Выполняется: {data.data.counts.processing}</span>
            <span className={data.data.counts.requires_attention ? 'danger' : ''}>
              Требует внимания: {data.data.counts.requires_attention}
            </span>
          </div>
        )}
        <div className="toolbar">
          <input
            aria-label="Поиск заявок"
            placeholder="Поиск: ID, ресурс, инициатор"
            value={params.get('q') ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
          <select
            aria-label="Сортировка заявок"
            value={params.get('sort') ?? '-created_at'}
            onChange={(e) => set('sort', e.target.value)}
          >
            <option value="-created_at">Сначала новые</option>
            <option value="created_at">Сначала старые</option>
          </select>
        </div>
        <div className="filters">
          {[['', 'Все'], ...Object.entries(labels)].map(([status, label]) => (
            <button
              key={status}
              className="pill"
              aria-pressed={(params.get('status') ?? '') === status}
              onClick={() => set('status', status)}
            >
              {label}{' '}
              {data.data &&
                (status ? data.data.counts[status as Status] : data.data.workspace_total)}
            </button>
          ))}
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : (
          data.data && (
            <>
              <p className="muted" role="status">
                Показано: {data.data.items.length} из {data.data.total}
              </p>
              <RenewalTable items={data.data.items} />
              {params.size > 0 && !data.data.total && (
                <button onClick={() => setParams({})}>Сбросить фильтры</button>
              )}
              <Pager
                total={data.data.total}
                offset={Number(params.get('offset') ?? 0)}
                change={(n) => set('offset', String(n))}
              />
            </>
          )
        )}
        <div className="card-footer">
          {user.roles.includes('initiator') ? (
            <button className="white pill" onClick={() => setCreate(true)}>
              Создать заявку
            </button>
          ) : (
            <span>Создавать заявки может только инициатор</span>
          )}
          <small>Один ресурс — одна активная заявка</small>
        </div>
      </section>
      {create && <CreateDialog close={() => setCreate(false)} />}
    </>
  );
}
function DecisionDialog({
  action,
  request: r,
  close,
}: {
  action: string;
  request: Renewal;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const title =
    action === 'approve'
      ? 'Согласовать заявку'
      : action === 'reject'
        ? 'Отклонить заявку'
        : 'Повторить обработку';
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/renewals/${r.id}/${action}`, {});
      await refresh();
      close();
    } catch (err) {
      setError(err);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} close={close}>
      <div className="stack">
        <p>
          <strong>{r.resource_name}</strong> · {r.id}
        </p>
        <div className="term">
          {date(r.previous_expires_on)} → {date(r.new_expires_on)}
        </div>
        <p>{money(r.amount_minor)}</p>
        <p className="muted">
          {action === 'approve'
            ? 'После согласования фоновый обработчик отправит операцию провайдеру. Срок изменится только после подтверждения.'
            : action === 'reject'
              ? 'Заявка будет отклонена. Срок ресурса не изменится, обращения к провайдеру не будет.'
              : 'Операция могла быть выполнена. Сначала проверим результат по прежнему ключу, сохранив ту же заявку и сумму.'}
        </p>
        {error != null && <ErrorState error={error} />}
        <div className="actions right">
          <button data-cancel onClick={close}>
            Отмена
          </button>
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? 'Сохраняем…' : title}
          </button>
        </div>
      </div>
    </Modal>
  );
}
export function DetailPage() {
  const { id } = useParams();
  const user = useUser();
  const [action, setAction] = useState<string>();
  const data = useQuery({
    queryKey: ['request', id],
    queryFn: () => api<Detail>(`/renewals/${encodeURIComponent(id!)}`),
    refetchInterval: (q) => (q.state.data?.request.status === 'processing' ? poll : false),
  });
  const r = data.data?.request;
  return (
    <>
      <Link to="/requests">← Заявки на продление</Link>
      <h1 tabIndex={-1}>{r?.resource_name ?? 'Заявка на продление'}</h1>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : (
        r &&
        data.data && (
          <>
            <div className="detail-top">
              <span>
                <code>{r.id}</code> · {time(r.created_at)}
              </span>
              <StatusChip status={r.status} />
              <div className="actions">
                {user.roles.includes('approver') &&
                  r.status === 'pending_approval' &&
                  r.created_by !== user.id && (
                    <>
                      <button onClick={() => setAction('reject')}>Отклонить…</button>
                      <button className="primary" onClick={() => setAction('approve')}>
                        Согласовать…
                      </button>
                    </>
                  )}
                {user.roles.includes('approver') && r.status === 'requires_attention' && (
                  <button className="primary" onClick={() => setAction('retry')}>
                    Повторить обработку…
                  </button>
                )}
              </div>
            </div>
            <div
              className={`banner ${r.status === 'requires_attention' ? 'warning' : ''}`}
              role="status"
            >
              {r.status === 'pending_approval'
                ? r.created_by === user.id && user.roles.includes('approver')
                  ? 'Это ваша заявка — согласовать или отклонить её должен другой согласующий.'
                  : 'Ожидает решения согласующего.'
                : r.status === 'processing'
                  ? r.provider_confirmation === 'uncertain'
                    ? 'Результат операции пока не подтверждён. Система проверяет состояние по тому же ключу.'
                    : 'Заявка согласована. Операция выполняется фоновым обработчиком.'
                  : r.status === 'completed'
                    ? 'Провайдер подтвердил операцию. Срок ресурса обновлён.'
                    : r.status === 'rejected'
                      ? 'Заявка отклонена. Срок не изменён, операция провайдеру не отправлялась.'
                      : r.provider_confirmation === 'confirmed'
                        ? 'Провайдер подтвердил операцию, но локальное обновление заблокировано. Требуется проверка оператором.'
                        : 'Не удалось подтвердить результат. Операция могла быть выполнена.'}
              {r.attention_reason && (
                <small>
                  <code>{r.attention_reason}</code>
                </small>
              )}
              {r.fixture_origin && (
                <small>
                  Историческая демо-запись: не является доказательством обращения к текущему
                  провайдеру.
                </small>
              )}
            </div>
            <div className="detail-grid">
              <div className="stack">
                <section className="card">
                  <h2>Продление ресурса</h2>
                  <div className="term">
                    <div>
                      <small>Прежний срок</small>
                      {date(r.previous_expires_on)}
                    </div>
                    <span>+30 дней →</span>
                    <div>
                      <small>Новый срок</small>
                      <strong>{date(r.new_expires_on)}</strong>
                    </div>
                  </div>
                  <p className="muted">
                    Текущий срок ресурса: {date(data.data.resource.expires_on)}
                  </p>
                </section>
                <section className="card">
                  <h2>История заявки</h2>
                  <Timeline events={data.data.events} />
                </section>
              </div>
              <div className="stack">
                <section className="card">
                  <h2>Сведения</h2>
                  <dl>
                    <dt>Пространство</dt>
                    <dd>{user.workspace_name}</dd>
                    <dt>Ресурс</dt>
                    <dd>
                      <code>{r.resource_id}</code>
                    </dd>
                    <dt>Категория</dt>
                    <dd>{r.category}</dd>
                    <dt>Инициатор</dt>
                    <dd>{r.created_by_name}</dd>
                    <dt>Согласующий</dt>
                    <dd>{r.decided_by_name ?? '—'}</dd>
                    <dt>Решение</dt>
                    <dd>{time(r.decided_at)}</dd>
                    <dt>Стоимость</dt>
                    <dd>{money(r.amount_minor)}</dd>
                    <dt>Ключ операции</dt>
                    <dd>
                      <code>{r.idempotency_key}</code>
                    </dd>
                  </dl>
                </section>
                <section className="card">
                  <h2>Выполнение</h2>
                  <dl>
                    <dt title="Резервируется до отправки: при сбое попытка могла не дойти до провайдера.">
                      POST-попытки ⓘ
                    </dt>
                    <dd>
                      {r.post_attempts} из 3 · всего {r.post_attempts_total}
                    </dd>
                    <dt>Последняя попытка</dt>
                    <dd>{time(r.last_attempt_at)}</dd>
                    <dt>Следующая проверка</dt>
                    <dd>{time(r.next_check_at)}</dd>
                    <dt>Подтверждение</dt>
                    <dd>
                      {
                        (
                          {
                            pending: 'Ожидается',
                            uncertain: 'Неопределённо',
                            confirmed: 'Подтверждено',
                            not_confirmed: 'Не подтверждено',
                          } as Record<string, string>
                        )[r.provider_confirmation]
                      }
                    </dd>
                    <dt>ID операции</dt>
                    <dd>
                      <code>{r.operation_id ?? '—'}</code>
                    </dd>
                  </dl>
                </section>
              </div>
            </div>
            {action && (
              <DecisionDialog action={action} request={r} close={() => setAction(undefined)} />
            )}
          </>
        )
      )}
    </>
  );
}
export function OverviewPage() {
  const user = useUser();
  const [drawer, setDrawer] = useState<string>();
  const [create, setCreate] = useState<string>();
  const data = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('/overview'),
    refetchInterval: poll,
  });
  const d = data.data;
  return (
    <>
      <Heading>Обзор</Heading>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={() => void data.refetch()} />
      ) : (
        d && (
          <>
            <div className="kpis">
              {[
                ['Ресурсы', d.counts.resources_total, '/resources'],
                ['На согласовании', d.counts.pending_approval, '/requests?status=pending_approval'],
                ['Выполняется', d.counts.processing, '/requests?status=processing'],
                [
                  'Требует внимания',
                  d.counts.requires_attention,
                  '/requests?status=requires_attention',
                ],
              ].map(([title, count, path]) => (
                <Link className="card" key={title} to={String(path)}>
                  <span>{title}</span>
                  <strong
                    className={title === 'Требует внимания' && Number(count) > 0 ? 'danger' : ''}
                  >
                    {count}
                  </strong>
                </Link>
              ))}
            </div>
            <div className="overview-grid">
              <section className="card">
                <h2>
                  {user.roles.includes('approver')
                    ? 'Требуют вашего решения'
                    : 'Ваши активные заявки'}
                </h2>
                <RequestSummary
                  items={
                    user.roles.includes('approver') ? d.awaiting_my_decision : d.my_active_requests
                  }
                />
              </section>
              <section className="card">
                <h2>Последние заявки</h2>
                <RequestSummary items={d.recent_requests} />
              </section>
              <section className="card">
                <h2>Ближайшие сроки окончания</h2>
                {d.expiring_resources.map((r) => {
                  const days = Math.ceil(
                    (Date.parse(`${r.expires_on}T00:00:00Z`) - Date.now()) / 86400000,
                  );
                  return (
                    <div className="list-item" key={r.id}>
                      <button className="text" onClick={() => setDrawer(r.id)}>
                        {r.name}
                      </button>
                      <small className={days <= 30 ? 'warning-text' : ''}>
                        {date(r.expires_on)} ·{' '}
                        {days >= 0 ? `через ${days} дн.` : `истёк ${-days} дн. назад`}
                      </small>
                    </div>
                  );
                })}
              </section>
              <section className="card">
                <h2>Последние события</h2>
                {d.recent_events.length ? (
                  d.recent_events.map((e) => (
                    <div className="list-item" key={e.id}>
                      <Link to={`/requests/${e.request_id}`}>{eventLabels[e.type] ?? e.type}</Link>
                      <small>
                        {time(e.occurred_at)} · {e.actor_name ?? 'Система'}
                      </small>
                    </div>
                  ))
                ) : (
                  <Empty>Событий пока нет</Empty>
                )}
              </section>
            </div>
          </>
        )
      )}
      {drawer && (
        <ResourceDrawer
          id={drawer}
          close={() => setDrawer(undefined)}
          create={(id) => {
            setDrawer(undefined);
            setCreate(id);
          }}
        />
      )}
      {create && <CreateDialog initial={create} close={() => setCreate(undefined)} />}
    </>
  );
}
function RequestSummary({ items }: { items: Renewal[] }) {
  return items.length ? (
    items.map((r) => (
      <div className="list-item" key={r.id}>
        <Link to={`/requests/${r.id}`}>{r.resource_name}</Link>
        <small>
          <code>{r.id}</code> · {r.created_by_name}
        </small>
        <StatusChip status={r.status} />
      </div>
    ))
  ) : (
    <Empty>Заявок пока нет</Empty>
  );
}
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? '';
  const offset = Number(params.get('offset') ?? 0);
  const set = (k: string, v: string) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      if (k !== 'offset') p.delete('offset');
      return p;
    });
  // Keep the lower bound stable while filters remain unchanged.
  const [now] = useState(() => Date.now());
  const data = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () =>
      api<Page<Audit>>(
        `/audit-events${query({ resource_id: params.get('resource_id') ?? '', type: params.get('type') ?? '', from: period ? new Date(now - Number(period) * 86400000).toISOString() : '', offset })}`,
      ),
    refetchInterval: poll,
  });
  const resources = useQuery({
    queryKey: ['audit-resources'],
    queryFn: () => api<ResourcePage>('/resources?limit=100'),
  });
  return (
    <>
      <Heading>История операций</Heading>
      <section className="card">
        <div className="toolbar">
          <select
            aria-label="Ресурс"
            value={params.get('resource_id') ?? ''}
            onChange={(e) => set('resource_id', e.target.value)}
          >
            <option value="">Все ресурсы</option>
            {resources.data?.items.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Тип события"
            value={params.get('type') ?? ''}
            onChange={(e) => set('type', e.target.value)}
          >
            <option value="">Все события</option>
            {Object.entries(eventLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Период"
            value={period}
            onChange={(e) => set('period', e.target.value)}
          >
            <option value="">Всё время</option>
            <option value="1">Сутки</option>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
          </select>
        </div>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : (
          data.data && (
            <>
              <p className="muted" role="status">
                Событий: {data.data.total}
              </p>
              {data.data.items.length ? (
                <div className="table-wrap">
                  <table className="responsive">
                    <thead>
                      <tr>
                        <th>Дата и время</th>
                        <th>Событие</th>
                        <th>Ресурс · заявка</th>
                        <th>Автор</th>
                        <th>Переход</th>
                        <th>Результат</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.items.map((e) => (
                        <tr key={e.id}>
                          <td>{time(e.occurred_at)}</td>
                          <td>
                            {eventLabels[e.type] ?? e.type}
                            {e.fixture_origin && <small>Историческая демо-запись</small>}
                          </td>
                          <td>
                            {e.resource_name}
                            <small>
                              <Link to={`/requests/${e.request_id}`}>{e.request_id}</Link>
                            </small>
                          </td>
                          <td>{e.actor_name ?? 'Система'}</td>
                          <td>
                            {e.to_status
                              ? `${e.from_status ? labels[e.from_status] : 'Создание'} → ${labels[e.to_status]}`
                              : '—'}
                          </td>
                          <td>{e.result ?? e.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <Empty>Событий пока нет</Empty>
                  {params.size > 0 && (
                    <button onClick={() => setParams({})}>Сбросить фильтры</button>
                  )}
                </>
              )}
              <Pager
                total={data.data.total}
                offset={offset}
                change={(n) => set('offset', String(n))}
              />
            </>
          )
        )}
      </section>
    </>
  );
}
