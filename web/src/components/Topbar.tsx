import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  clearSession,
  ensureSession,
  getAccessToken,
  getUserDisplayName,
  getUserEmail,
  getUserInitialLetter,
  onAuthChange,
} from '../lib/auth';
import { toast } from '../lib/toast';
import { BrandMark } from './BrandMark';

export type TopbarProps = {
  /** Override gallery link (e.g. continueSession). */
  quizzesTo?: string;
  /** Intercept home navigation (host closes room). Call `go()` to finish. */
  onHomeClick?: (e: MouseEvent, go: () => void) => void;
  /** Intercept gallery navigation (host closes room). Call `go()` to finish. */
  onQuizzesClick?: (e: MouseEvent, go: () => void) => void;
};

export function Topbar({ quizzesTo = '/quizzes', onHomeClick, onQuizzesClick }: TopbarProps = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(Boolean(getAccessToken()));
  const [menuOpen, setMenuOpen] = useState(false);
  const [letter, setLetter] = useState(getUserInitialLetter());
  const [label, setLabel] = useState(getUserDisplayName() || getUserEmail() || 'Аккаунт');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      setAuthed(Boolean(getAccessToken()));
      setLetter(getUserInitialLetter());
      setLabel(getUserDisplayName() || getUserEmail() || 'Аккаунт');
    };
    refresh();
    const off = onAuthChange(refresh);
    ensureSession().then(refresh);
    return off;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onLogin = loc.pathname === '/login';
  const homeActive = loc.pathname === '/';
  const quizzesActive = loc.pathname.startsWith('/quizzes');
  const builderActive = loc.pathname.startsWith('/builder');

  return (
    <header className="landing-nav topbar" aria-label="Навигация">
      <div className="landing-nav__inner">
        <Link
          className="landing-nav__brand"
          to="/"
          aria-label="Название сайта"
          onClick={(e) => {
            if (!onHomeClick) return;
            e.preventDefault();
            onHomeClick(e, () => navigate('/'));
          }}
        >
          <BrandMark size={36} />
          <span>Платформа квизов</span>
        </Link>
        <nav className="landing-nav__side landing-nav__mid" aria-label="Основные разделы">
          <Link
            className={`landing-link${homeActive ? ' is-active' : ''}`}
            id="btnHome"
            to="/"
            onClick={(e) => {
              if (!onHomeClick) return;
              e.preventDefault();
              onHomeClick(e, () => navigate('/'));
            }}
          >
            Главная
          </Link>
          <Link
            className={`landing-link${quizzesActive ? ' is-active' : ''}`}
            id="btnTopGallery"
            to={quizzesTo}
            onClick={(e) => {
              if (!onQuizzesClick) return;
              e.preventDefault();
              onQuizzesClick(e, () => navigate(quizzesTo));
            }}
          >
            Мои квизы
          </Link>
          <Link
            className={`landing-link${builderActive ? ' is-active' : ''}`}
            to="/builder?new=1"
          >
            Создать квиз
          </Link>
        </nav>
        <nav className="landing-nav__side landing-nav__right" aria-label="Аккаунт">
          <span id="topbarAuthMount">
            {!authed && !onLogin && (
              <Link
                className="btn"
                to={`/login?next=${encodeURIComponent((loc.pathname + loc.search) || '/')}`}
              >
                Вход
              </Link>
            )}
            {authed && (
              <div ref={menuRef} className={`user-menu${menuOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="user-avatar-btn"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label={`Меню: ${label}`}
                  title={label}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setMenuOpen((o) => !o);
                  }}
                >
                  {letter}
                </button>
                <div className="user-menu-panel">
                  <div className="user-menu-panel__card">
                    <button
                      type="button"
                      className="btn bad user-menu-logout"
                      onClick={() => {
                        clearSession();
                        toast('Вы вышли');
                        setMenuOpen(false);
                      }}
                    >
                      Выйти из аккаунта
                    </button>
                  </div>
                </div>
              </div>
            )}
          </span>
        </nav>
      </div>
    </header>
  );
}
