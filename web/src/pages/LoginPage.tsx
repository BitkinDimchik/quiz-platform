import { FormEvent, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import {
  setAccessToken,
  setCurrentUserId,
  setUserProfile,
  whenSessionReady,
} from '../lib/auth';
import { sanitizeNext } from '../lib/next-url';
import { toast } from '../lib/toast';
import { Topbar } from '../components/Topbar';

type AuthRes = {
  accessToken: string;
  user: { id: string; email: string; displayName?: string | null };
};

export function LoginPage() {
  const [tab, setTab] = useState<'login' | 'reg'>('login');
  const [loginErr, setLoginErr] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regName, setRegName] = useState('');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const nextParam = params.get('next');

  useEffect(() => {
    void whenSessionReady().then((ok) => {
      if (ok) navigate(sanitizeNext(nextParam), { replace: true });
    });
  }, [navigate, nextParam]);

  function goNext() {
    navigate(sanitizeNext(params.get('next')));
  }

  async function onLogin(e?: FormEvent) {
    e?.preventDefault();
    setLoginErr('');
    try {
      if (!email.trim() || !password) throw new Error('Заполните email и пароль');
      const data = await apiFetch<AuthRes>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setAccessToken(data.accessToken);
      setCurrentUserId(data.user.id);
      setUserProfile(data.user.email, (data.user.displayName && data.user.displayName.trim()) || '');
      toast('Добро пожаловать!');
      goNext();
    } catch (err: unknown) {
      const e2 = err as { status?: number; code?: string; message?: string };
      if (e2.status === 404 && e2.code === 'NOT_FOUND') {
        setLoginErr('Пользователь не зарегистрирован');
        return;
      }
      toast(e2.message || 'Ошибка входа');
    }
  }

  async function onReg(e?: FormEvent) {
    e?.preventDefault();
    try {
      if (!regEmail.trim() || !regPass) throw new Error('Заполните email и пароль');
      if (regPass.length < 8) throw new Error('Пароль не короче 8 символов');
      const data = await apiFetch<AuthRes>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: regEmail.trim(),
          password: regPass,
          displayName: regName.trim() || null,
        }),
      });
      setAccessToken(data.accessToken);
      setCurrentUserId(data.user.id);
      setUserProfile(data.user.email, (data.user.displayName && data.user.displayName.trim()) || '');
      toast('Аккаунт создан');
      goNext();
    } catch (err: unknown) {
      toast((err as Error).message || 'Ошибка регистрации');
    }
  }

  return (
    <>
      <Topbar />
      <div className="container">
        <div className="card auth-wrap auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`btn${tab === 'login' ? ' primary' : ''}`}
              onClick={() => {
                setTab('login');
                setLoginErr('');
              }}
            >
              Вход
            </button>
            <button
              type="button"
              className={`btn${tab === 'reg' ? ' primary' : ''}`}
              onClick={() => {
                setTab('reg');
                setLoginErr('');
              }}
            >
              Регистрация
            </button>
          </div>

          {tab === 'login' && (
            <form onSubmit={onLogin}>
              <h2>Войти</h2>
              <div className="field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLoginErr('');
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">Пароль</label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginErr('');
                  }}
                />
              </div>
              <p
                id="loginErr"
                className="auth-login-err"
                role="alert"
                hidden={!loginErr}
              >
                {loginErr}
              </p>
              <button type="submit" className="btn primary">
                Войти
              </button>
            </form>
          )}

          {tab === 'reg' && (
            <form onSubmit={onReg}>
              <h2>Регистрация</h2>
              <div className="field">
                <label htmlFor="reg-email">Email</label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-password">Пароль (мин. 8 символов)</label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-name">Имя (необязательно)</label>
                <input
                  id="reg-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn primary">
                Создать аккаунт
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
