import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  date,
  labels,
  money,
  time,
  type Audit,
  type Renewal,
  type Status,
} from '../api/client';
export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip ${status}`}>{labels[status]}</span>;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="error">
      <p>
        {error instanceof ApiError
          ? `${error.status_code} · ${error.message}`
          : 'Не удалось загрузить данные. Проверьте соединение.'}
      </p>
      {error instanceof ApiError && <code>{error.error_code}</code>}
      {retry && <button onClick={retry}>Повторить</button>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="card skeleton" role="status">
      Загрузка данных…
      <div />
      <div />
      <div />
    </div>
  );
}
export function Empty({ children = 'Ничего не найдено' }: { children?: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Modal({
  title,
  children,
  close,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const cancelButtons = dialog.querySelectorAll<HTMLElement>('[data-cancel]');
    cancelButtons.item(cancelButtons.length - 1)?.focus();
    return () => {
      dialog.close();
      (opener?.isConnected ? opener : document.querySelector<HTMLElement>('h1'))?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? 'drawer' : ''}
      aria-modal="true"
      aria-labelledby={id}
      onKeyDown={e => {
        if (e.key !== 'Tab') return;
        const elements = Array.from(ref.current!.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el => el.getClientRects().length > 0);
        const first = elements[0]; const last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button data-cancel aria-label="Закрыть" onClick={close}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function RenewalTable({ items }: { items: Renewal[] }) {
  if (!items.length) return <Empty>Заявок пока нет</Empty>;
  return (
    <div className="table-wrap">
      <table className="responsive">
        <thead>
          <tr>
            <th>Ресурс</th>
            <th>Срок</th>
            <th>Стоимость</th>
            <th>Статус</th>
            <th>Инициатор</th>
            <th>Создана</th>
            <th>
              <span className="sr-only">Действие</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="resource-title" to={`/requests/${r.id}`}>
                  {r.resource_name}
                </Link>
                <small>
                  <code>
                    {r.id} · {r.resource_id}
                  </code>
                </small>
              </td>
              <td>
                {date(r.new_expires_on)}
                <small>было {date(r.previous_expires_on)}</small>
              </td>
              <td>{money(r.amount_minor)}</td>
              <td>
                <StatusChip status={r.status} />
              </td>
              <td>{r.created_by_name}</td>
              <td>{time(r.created_at)}</td>
              <td>
                <Link to={`/requests/${r.id}`}>Открыть →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export const eventLabels: Record<string, string> = {
  request_created: 'Заявка создана',
  request_approved: 'Заявка согласована',
  request_rejected: 'Заявка отклонена',
  job_enqueued: 'Задача в очереди',
  attempt_reserved: 'POST-попытка зарезервирована',
  provider_post: 'Отправка провайдеру',
  provider_check: 'Проверка результата',
  provider_confirmed: 'Провайдер подтвердил',
  term_updated: 'Срок обновлён',
  requires_attention: 'Требует внимания',
  retry_requested: 'Повторная обработка',
  job_recovered: 'Задача восстановлена',
};
export function Timeline({ events }: { events: Audit[] }) {
  return events.length ? (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <strong>{eventLabels[e.type] ?? e.type}</strong>
          <small>
            {time(e.occurred_at)} · {e.actor_name ?? 'Система'}
          </small>
          <p>{e.detail}</p>
          {e.result && <small>{e.result}</small>}
          {e.fixture_origin && <small>Историческая демо-запись</small>}
        </li>
      ))}
    </ol>
  ) : (
    <Empty>Событий пока нет</Empty>
  );
}
export function Pager({
  total,
  offset,
  change,
}: {
  total: number;
  offset: number;
  change: (n: number) => void;
}) {
  return total > 50 ? (
    <div className="actions">
      <button disabled={!offset} onClick={() => change(Math.max(0, offset - 50))}>
        Назад
      </button>
      <span>
        {offset + 1}–{Math.min(total, offset + 50)} из {total}
      </span>
      <button disabled={offset + 50 >= total} onClick={() => change(offset + 50)}>
        Далее
      </button>
    </div>
  ) : null;
}
