import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FolderOpen, Pencil, Play, RefreshCw, Trash2, Upload } from 'lucide-react';
import { apiFetch, withAuth } from '../lib/api';
import { getAccessToken, getCurrentUserId, whenSessionReady } from '../lib/auth';
import { toast } from '../lib/toast';
import { Topbar } from '../components/Topbar';
import '../styles/quizzes.css';

type QuizRow = {
  id: string;
  title?: string;
  description?: string | null;
  background?: string | null;
  roundsCount?: number;
  publishedRevisionId?: string | null;
  ownerUserId?: string;
  ownerLabel?: string;
};

export function QuizzesPage() {
  const [params] = useSearchParams();
  const continueSessionId =
    params.get('continueSession') === '1' ? params.get('sessionId') : null;
  const soloHost = params.get('soloHost') === '1';
  const [activeTab, setActiveTab] = useState<'mine' | 'browse'>('mine');
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const loadSeqRef = useRef(0);
  const navigate = useNavigate();

  const loginNext = useCallback(() => {
    const next = `/quizzes${window.location.search || ''}`;
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [navigate]);

  const requireLogin = useCallback(() => {
    if (!getAccessToken()) {
      toast('Сначала войдите');
      loginNext();
      return false;
    }
    return true;
  }, [loginNext]);

  const loadList = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const path = activeTab === 'mine' ? '/api/quizzes' : '/api/quizzes/browse';
      const res = await apiFetch<{ quizzes: QuizRow[] }>(path, { headers: withAuth({}) });
      if (seq !== loadSeqRef.current) return;
      const rows = (res.quizzes || []).map((q) =>
        activeTab === 'browse'
          ? q
          : { ...q, ownerUserId: getCurrentUserId() },
      );
      setQuizzes(rows);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        loginNext();
        return;
      }
      const msg = err.message || 'Ошибка загрузки';
      const hint = /fetch|network|failed|ECONNREFUSED|502|503/i.test(msg)
        ? 'Сервер недоступен — перезапустите backend (npm run start:dev)'
        : msg;
      toast(hint);
      setQuizzes([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [activeTab, loginNext]);

  useEffect(() => {
    let cancelled = false;
    setSessionChecking(true);
    setSessionReady(false);
    void whenSessionReady().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        loginNext();
        return;
      }
      setSessionChecking(false);
      setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loginNext]);

  useEffect(() => {
    if (!sessionReady) return;
    void loadList();
  }, [activeTab, loadList, sessionReady]);

  async function cloneQuiz(sourceId: string) {
    if (!requireLogin()) return;
    try {
      const res = await apiFetch<{ quizId: string }>(`/api/quizzes/${sourceId}/clone`, {
        method: 'POST',
        headers: withAuth({}),
      });
      toast('Копия создана у вас — открываем редактор');
      navigate(`/builder?quizId=${encodeURIComponent(res.quizId)}`);
    } catch (e) {
      toast((e as Error).message || 'Не удалось создать копию');
    }
  }

  async function exportQuiz(quizId: string) {
    if (!requireLogin()) return;
    if (exportingId) return;
    setExportingId(quizId);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/export`, {
        cache: 'no-store',
        headers: withAuth({}),
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
        throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m?.[1] || 'quiz.quizpack.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('Пакет квиза скачан');
    } catch (e) {
      toast((e as Error).message || 'Не удалось экспортировать');
    } finally {
      setExportingId(null);
    }
  }

  async function importQuizFile(file: File | undefined) {
    if (!requireLogin()) return;
    if (!file || importing) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name || 'quiz.quizpack.zip');
      const res = await apiFetch<{ quizId: string }>('/api/quizzes/import', {
        method: 'POST',
        headers: withAuth({}),
        body: fd,
      });
      toast('Квиз импортирован — открываем редактор');
      navigate(`/builder?quizId=${encodeURIComponent(res.quizId)}`);
    } catch (e) {
      toast((e as Error).message || 'Не удалось импортировать');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function startQuiz(quizId: string, publishedRevisionId: string | null) {
    if (launchingId) return;
    setLaunchingId(quizId);
    let didNavigate = false;
    if (soloHost) {
      localStorage.setItem('LAST_QUIZ_ID', quizId);
      didNavigate = true;
      navigate(`/host?solo=1&quizId=${encodeURIComponent(quizId)}`);
      return;
    }
    try {
      if (continueSessionId) {
        if (!publishedRevisionId) {
          toast('У этого квиза нет опубликованной версии — откройте редактор и сохраните квиз');
          return;
        }
        const hostSecret = localStorage.getItem('LAST_HOST_SECRET');
        if (!hostSecret) {
          toast('Не найден ключ ведущего — откройте страницу запуска из той же комнаты');
          return;
        }
        await apiFetch(`/api/session/${encodeURIComponent(continueSessionId)}/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Host-Secret': hostSecret,
          },
          body: JSON.stringify({ quizRevisionId: publishedRevisionId }),
        });
        localStorage.setItem('LAST_QUIZ_ID', quizId);
        localStorage.setItem('LAST_SESSION_ID', continueSessionId);
        toast('Квиз добавлен в комнату');
        const rc = localStorage.getItem('LAST_ROOM_CODE') || '';
        didNavigate = true;
        navigate(
          `/host?sessionId=${encodeURIComponent(continueSessionId)}&hostSecret=${encodeURIComponent(hostSecret)}&roomCode=${encodeURIComponent(rc)}&quizId=${encodeURIComponent(quizId)}`,
        );
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAccessToken();
      if (token) Object.assign(headers, withAuth({}));
      const res = await apiFetch<{ sessionId: string; hostSecret: string; roomCode: string }>(
        '/api/session/start',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            quizId,
            advanceMode: 'automatic',
            answerRevealMode: 'per_question',
          }),
        },
      );
      localStorage.setItem('LAST_QUIZ_ID', quizId);
      localStorage.setItem('LAST_SESSION_ID', res.sessionId);
      localStorage.setItem('LAST_HOST_SECRET', res.hostSecret);
      localStorage.setItem('LAST_ROOM_CODE', res.roomCode);
      toast('Сессия создана');
      didNavigate = true;
      navigate(
        `/host?sessionId=${encodeURIComponent(res.sessionId)}&hostSecret=${encodeURIComponent(res.hostSecret)}&roomCode=${encodeURIComponent(res.roomCode)}&quizId=${encodeURIComponent(quizId)}`,
      );
    } catch (e) {
      toast((e as Error).message || 'Не удалось запустить');
    } finally {
      if (!didNavigate) setLaunchingId(null);
    }
  }

  async function deleteQuiz(quizId: string) {
    if (!window.confirm('Удалить этот квиз? Действие необратимо.')) return;
    try {
      await apiFetch(`/api/quizzes/${quizId}`, { method: 'DELETE', headers: withAuth({}) });
      toast('Квиз удалён');
      await loadList();
    } catch (e) {
      toast((e as Error).message || 'Не удалось удалить');
    }
  }

  function heroStyle(bg: string | null | undefined): CSSProperties {
    if (!bg) return {};
    const overlay = 'linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.6))';
    const s = String(bg).trim();
    if (s.startsWith('gradient:')) {
      return {
        backgroundImage: `${overlay}, ${s.slice('gradient:'.length)}`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    return {
      backgroundImage: `${overlay}, url(${JSON.stringify(s).slice(1, -1)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  return (
    <>
      <Topbar />
      <div className="container quizzes-page">
      <div className="page-head">
        <p className="page-kicker">Галерея</p>
        <h1 className="page-title">{activeTab === 'mine' ? 'Мои квизы' : 'Каталог квизов'}</h1>
        <p className="page-lead">
          {continueSessionId
            ? 'Выберите квиз и запустите его для игроков в текущей комнате.'
            : 'Запускайте игры, редактируйте черновики или копируйте квизы из каталога.'}
        </p>
        <div className="quizzes-actions">
          <button
            className={`btn${activeTab === 'mine' ? ' primary' : ''}`}
            type="button"
            onClick={() => setActiveTab('mine')}
          >
            Мои квизы
          </button>
          <button
            className={`btn${activeTab === 'browse' ? ' primary' : ''}`}
            type="button"
            onClick={() => setActiveTab('browse')}
          >
            Все доступные квизы
          </button>
          <button className="btn" type="button" onClick={() => loadList()}>
            <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
            Обновить
          </button>
          {activeTab === 'mine' ? (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => void importQuizFile(e.target.files?.[0])}
              />
              <button
                className="btn"
                type="button"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
                {importing ? 'Импорт…' : 'Импорт'}
              </button>
            </>
          ) : null}
          {continueSessionId && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                const hostSecret = localStorage.getItem('LAST_HOST_SECRET') || '';
                if (!hostSecret) {
                  toast('Не найден ключ ведущего — откройте галерею из комнаты ведущего');
                  return;
                }
                const rc = localStorage.getItem('LAST_ROOM_CODE') || '';
                const lastQuizId = localStorage.getItem('LAST_QUIZ_ID') || '';
                navigate(
                  `/host?sessionId=${encodeURIComponent(continueSessionId)}&hostSecret=${encodeURIComponent(hostSecret)}${rc ? `&roomCode=${encodeURIComponent(rc)}` : ''}${lastQuizId ? `&quizId=${encodeURIComponent(lastQuizId)}` : ''}`,
                );
              }}
            >
              <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
              В комнату
            </button>
          )}
        </div>
        {continueSessionId && (
          <div className="continue-session-banner" role="status">
            Текущая комната активна — выберите квиз и нажмите «Запустить», чтобы начать его для тех же
            игроков.
          </div>
        )}
        <div className={`loading-banner${loading || sessionChecking ? ' show' : ''}`}>
          {sessionChecking ? 'Проверка входа…' : 'Загрузка…'}
        </div>
      </div>

      <div id="grid" className="quizzes-grid" aria-live="polite">
        {quizzes.map((q) => {
          const isMine = q.ownerUserId === getCurrentUserId();
          const showPlay = activeTab === 'mine' || isMine;
          const showEditDelete = activeTab === 'mine';
          const pubId = q.publishedRevisionId || '';
          const missingPublishedRevision = Boolean(continueSessionId && !pubId);
          const playDisabled = missingPublishedRevision || Boolean(launchingId);
          const metaExtra =
            activeTab === 'browse' && q.ownerLabel ? ` · ${q.ownerLabel}` : '';
          return (
            <article
              key={q.id}
              className="quiz-card"
              data-id={q.id}
              data-published-revision-id={pubId}
            >
              <div className="quiz-card__hero" style={heroStyle(q.background)} />
              <div className="quiz-card__body">
                <h3 className="quiz-card__title">{q.title || 'Без названия'}</h3>
                {(q.description || '').trim() ? (
                  <p className="quiz-card__desc">{(q.description || '').trim()}</p>
                ) : null}
                <div className="quiz-card__meta">
                  {q.roundsCount ?? 0} раунд(ов){metaExtra}
                </div>
                <div className="quiz-card__btns">
                  {showPlay && (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={playDisabled}
                      title={
                        missingPublishedRevision
                          ? 'Сначала сохраните и опубликуйте квиз в редакторе'
                          : undefined
                      }
                      onClick={() => startQuiz(q.id, pubId || null)}
                    >
                      {launchingId === q.id ? (
                        'Запуск…'
                      ) : (
                        <>
                          <Play size={16} strokeWidth={2.2} aria-hidden="true" />
                          Запустить
                        </>
                      )}
                    </button>
                  )}
                  {showEditDelete && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => navigate(`/builder?quizId=${encodeURIComponent(q.id)}`)}
                    >
                      <Pencil size={16} strokeWidth={2.2} aria-hidden="true" />
                      Редактировать
                    </button>
                  )}
                  {showEditDelete && (
                    <button
                      type="button"
                      className="btn"
                      disabled={exportingId === q.id}
                      onClick={() => void exportQuiz(q.id)}
                    >
                      <Download size={16} strokeWidth={2.2} aria-hidden="true" />
                      {exportingId === q.id ? 'Экспорт…' : 'Экспорт'}
                    </button>
                  )}
                  <button type="button" className="btn good" onClick={() => cloneQuiz(q.id)}>
                    <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
                    Копировать
                  </button>
                  {showEditDelete && (
                    <button type="button" className="btn bad" onClick={() => deleteQuiz(q.id)}>
                      <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!sessionChecking && !loading && quizzes.length === 0 && (
        <div id="empty" className="quiz-empty">
          <div className="quiz-empty__icon" aria-hidden="true">
            <FolderOpen size={28} strokeWidth={2} />
          </div>
          <h2>{activeTab === 'mine' ? 'У вас пока нет квизов' : 'Каталог пуст'}</h2>
          <p>
            {activeTab === 'mine'
              ? 'Создайте или скопируйте квиз из каталога.'
              : 'Пока нет доступных квизов.'}
          </p>
          <Link className="btn primary" to="/builder?new=1">
            Открыть конструктор
          </Link>
        </div>
      )}
      </div>
    </>
  );
}
