import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Check, Copy, ExternalLink, PenLine, Smartphone } from 'lucide-react';
import { Topbar } from '../components/Topbar';
import { LandingDecor } from '../components/LandingDecor';
import { computePublicOrigin } from '../lib/host/public-origin';
import { toast } from '../lib/toast';

type ConnectTarget = {
  id: 'player' | 'creator';
  title: string;
  text: string;
  path: string;
  icon: 'player' | 'creator';
};

const TARGETS: ConnectTarget[] = [
  {
    id: 'player',
    title: 'Игроки',
    text: 'Телефоны участников: вход в комнату по коду и ответы в реальном времени.',
    path: '/player',
    icon: 'player',
  },
  {
    id: 'creator',
    title: 'Создатели',
    text: 'Планшет или другой ПК: конструктор квизов и управление раундами.',
    path: '/builder?new=1',
    icon: 'creator',
  },
];

async function makeQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#1b2744', light: '#ffffff' },
  });
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Ссылка скопирована');
    return true;
  } catch {
    toast('Не удалось скопировать');
    return false;
  }
}

function ConnectCard({
  target,
  origin,
}: {
  target: ConnectTarget;
  origin: string;
}) {
  const url = origin ? `${origin.replace(/\/$/, '')}${target.path}` : '';
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setQr('');
      return;
    }
    makeQrDataUrl(url)
      .then((data) => {
        if (!cancelled) setQr(data);
      })
      .catch(() => {
        if (!cancelled) setQr('');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const onCopy = useCallback(async () => {
    if (!url) return;
    const ok = await copyUrl(url);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [url]);

  return (
    <article className="connect-card">
      <div className="connect-card__head">
        <div className="landing-badge" aria-hidden="true">
          {target.icon === 'player' ? (
            <Smartphone size={22} strokeWidth={2.2} />
          ) : (
            <PenLine size={22} strokeWidth={2.2} />
          )}
        </div>
        <div>
          <h2 className="connect-card__title">{target.title}</h2>
          <p className="connect-card__text">{target.text}</p>
        </div>
      </div>
      <div className="connect-qr">
        {qr ? (
          <img src={qr} alt={`QR: ${target.title}`} width={280} height={280} />
        ) : (
          <div className="connect-qr__placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="connect-url" title={url || undefined}>
        {url || '…'}
      </div>
      <div className="connect-actions">
        <button type="button" className="btn" onClick={onCopy} disabled={!url}>
          {copied ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={16} strokeWidth={2.4} aria-hidden="true" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
        {url ? (
          <a className="btn primary" href={url} target="_blank" rel="noreferrer">
            Открыть
            <ExternalLink size={16} strokeWidth={2.4} aria-hidden="true" />
          </a>
        ) : (
          <span className="btn primary is-disabled" aria-disabled="true">
            Открыть
          </span>
        )}
      </div>
    </article>
  );
}

export function ConnectPage() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    let cancelled = false;
    computePublicOrigin().then((o) => {
      if (!cancelled) setOrigin(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSameWifi =
    origin &&
    (() => {
      try {
        return new URL(origin).hostname !== location.hostname;
      } catch {
        return false;
      }
    })();

  return (
    <div className="landing-shell">
      <Topbar />
      <LandingDecor />
      <section className="landing-section connect-section" aria-label="Подключение устройств">
        <p className="connect-kicker">
          <Link className="landing-link" to="/">
            ← На главную
          </Link>
        </p>
        <h1 className="landing-h2">QR и ссылки для устройств</h1>
        <p className="landing-lead">
          Отсканируйте код или откройте ссылку на телефоне, планшете или другом компьютере в той же
          Wi‑Fi сети.
        </p>
        {onSameWifi ? (
          <p className="connect-hint">
            Для телефонов используется адрес в локальной сети: <strong>{origin}</strong>
          </p>
        ) : null}
        <div className="connect-grid">
          {TARGETS.map((t) => (
            <ConnectCard key={t.id} target={t} origin={origin} />
          ))}
        </div>
      </section>
    </div>
  );
}
