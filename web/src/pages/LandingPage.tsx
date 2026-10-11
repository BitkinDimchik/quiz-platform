import { Link } from 'react-router-dom';
import { ArrowRight, PenLine, QrCode, Radio } from 'lucide-react';
import { Topbar } from '../components/Topbar';
import { LandingDecor } from '../components/LandingDecor';

export function LandingPage() {
  return (
    <div className="landing-shell">
      <Topbar />
      <LandingDecor />
      <div className="landing-inner">
        <main className="landing-hero" aria-label="Главный экран">
          <h1 className="landing-h1">
            Интерактивная платформа
            <span className="landing-h1__accent">ДЛЯ КВИЗОВ</span>
          </h1>
          <p className="landing-sub">
            Создавайте увлекательные квизы с раундами, вопросами и медиа. Подключайте игроков через
            QR‑код и устраивайте настоящие интерактивные баттлы в реальном времени.
          </p>
          <div className="landing-cta">
            <Link className="landing-btn" to="/builder?new=1">
              Создать квиз
              <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          </div>
        </main>
      </div>
      <section className="landing-section" id="how" aria-label="Как работает платформа">
        <h2 className="landing-h2">Как это работает</h2>
        <p className="landing-lead">
          От конструктора до итогов — один непрерывный поток. Вы ведёте игру с общего экрана, игроки
          отвечают со своих телефонов.
        </p>
        <div className="landing-grid">
          <div className="landing-card">
            <div className="landing-badge" aria-hidden="true">
              <PenLine size={22} strokeWidth={2.2} />
            </div>
            <div className="landing-card__title">Соберите квиз</div>
            <div className="landing-card__text">
              Разложите игру по раундам, добавьте вопросы, картинки и музыку.
            </div>
          </div>
          <div className="landing-card">
            <div className="landing-badge" aria-hidden="true">
              <Radio size={22} strokeWidth={2.2} />
            </div>
            <div className="landing-card__title">Откройте комнату</div>
            <div className="landing-card__text">
              Запустите сессию и пригласите участников — баттл начнётся, когда все на месте.
            </div>
          </div>
          <div className="landing-card">
            <div className="landing-badge" aria-hidden="true">
              <QrCode size={22} strokeWidth={2.2} />
            </div>
            <div className="landing-card__title">Подключите игроков</div>
            <div className="landing-card__text">
              Участники входят по QR‑коду или коду комнаты и отвечают в реальном времени.
            </div>
          </div>
        </div>
        <div className="landing-cta landing-cta--footer">
          <Link className="landing-btn landing-btn--secondary" to="/connect">
            <QrCode size={18} strokeWidth={2.4} aria-hidden="true" />
            QR и ссылки для устройств
          </Link>
        </div>
      </section>
    </div>
  );
}
