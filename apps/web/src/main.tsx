import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api, clearSession, type User } from './api/client';
import { ErrorState, Loading } from './components/common';
import { AuditPage, DetailPage, OverviewPage, RequestsPage, ResourcesPage } from './pages';
import './styles.css';
import { AuthContext, cache } from './state';
function FocusRoute() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>('h1')?.focus();
  }, [pathname]);
  return null;
}
function Brand() {
  return (
    <Link className="brand" to="/overview">
      <span aria-hidden="true" className="logo">
        ◉
      </span>
      RenewalDesk
    </Link>
  );
}
function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<User>('/auth/me'),
    retry: false,
  });
  if (me.data) return <Navigate to="/overview" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(e.currentTarget);
    try {
      clearSession();
      cache.clear();
      const result = await api<{ user: User }>('/auth/login', {
        email: data.get('email'),
        password: data.get('password'),
      });
      cache.setQueryData(['session'], result.user);
      navigate('/overview');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Brand />
      <p className="muted">Согласование продлений ресурсов</p>
      <form className="card stack" onSubmit={submit}>
        <h1 tabIndex={-1}>Вход</h1>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Пароль
          <div className="actions">
            <input
              name="password"
              aria-label="Пароль"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
            />
            <button type="button" aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? 'Скрыть' : 'Показать'}
            </button>
          </div>
        </label>
        {error != null && <ErrorState error={error} />}
        <button className="primary" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
function Shell() {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<unknown>();
  const me = useQuery({ queryKey: ['session'], queryFn: () => api<User>('/auth/me') });
  useEffect(() => {
    const expired = () => {
      cache.clear();
      navigate('/login');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [navigate]);
  if (me.isPending)
    return (
      <main className="container">
        <h1>RenewalDesk</h1>
        <Loading />
      </main>
    );
  if (me.error || !me.data) return <Navigate to="/login" replace />;
  const user = me.data;
  async function logout() {
    try {
      await api('/auth/logout', {});
      clearSession();
      cache.clear();
      navigate('/login');
    } catch (err) {
      setError(err);
    }
  }
  return (
    <AuthContext.Provider value={user}>
      <header className="container header">
        <Brand />
        <button
          className="menu-toggle"
          aria-expanded={menu}
          aria-controls="navigation"
          onClick={() => setMenu(!menu)}
        >
          {menu ? 'Закрыть' : 'Меню'}
        </button>
        <nav id="navigation" className={menu ? 'open' : ''} aria-label="Основная навигация">
          {[
            ['/overview', 'Обзор'],
            ['/resources', 'Ресурсы'],
            ['/requests', 'Заявки на продление'],
            ['/audit', 'История операций'],
          ].map(([to, text]) => (
            <NavLink key={to} to={to} onClick={() => setMenu(false)}>
              {text}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <span className="workspace">{user.workspace_name}</span>
          <span>
            {user.name}
            <small>
              {user.roles.map((r) => (r === 'initiator' ? 'Инициатор' : 'Согласующий')).join(', ')}
            </small>
          </span>
          <button onClick={logout}>Выйти</button>
        </div>
      </header>
      <main className="container content">
        <FocusRoute />
        {error != null && <ErrorState error={error} />}
        <Outlet />
      </main>
    </AuthContext.Provider>
  );
}
function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<DetailPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route
          path="*"
          element={
            <>
              <h1 tabIndex={-1}>Страница не найдена</h1>
              <Link to="/overview">Вернуться к обзору</Link>
            </>
          }
        />
      </Route>
    </Routes>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
