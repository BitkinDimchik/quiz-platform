import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Topbar } from '../components/Topbar';
import {
  InheritNumericSpinnerInput,
  NumericSpinnerInput,
} from '../components/NumericSpinnerInput';
import {
  BgFrameModal,
  GradModal,
  OptionsEditor,
  useTestAudio,
  type BgTarget,
} from '../lib/builder/OptionsEditor';
import {
  ensureChoiceOptions,
  ensureMatchingShape,
  effectiveQuestionPoints,
  effectiveQuestionReadSec,
  effectiveQuestionTimer,
  isQuestionComplete,
  isRoundComplete,
  fileToDataUrl,
  usesChoiceAnswers,
  usesTextAnswers,
  uuid,
  BUILDER_QUESTION_TYPES,
  BUILDER_QUESTION_TYPE_LABELS,
  roundDefaultPointsForType,
  setRoundDefaultPointsForType,
} from '../lib/builder/defaults';
import { ImageHideEditor } from '../lib/builder/ImageHideEditor';
import { PasteImageZone } from '../lib/builder/PasteImageZone';
import { StageTypeStylesEditor } from '../lib/builder/StageTypeStylesEditor';
import { getStageSlotFontFamily, setStageSlotFontFamily } from '../lib/builder/stage-layout-style';
import { StageFontSelect } from '../components/StageFontSelect';
import { BettingSettings } from '../components/BettingSettings';
import { resetBettingSettings } from '../lib/builder/betting-settings';
import { DEFAULT_IMAGE_HIDE_RECT } from '../lib/host/image-hide-rect';
import { useBuilderDraft } from '../lib/builder/useBuilderDraft';
import { usePanelScrollChain } from '../lib/builder/usePanelScrollChain';
import { ROUND_CONFIG_TXT_HELP } from '../lib/builder/import-txt';
import type { MusicUploadTarget } from '../lib/builder/types';
import { toast } from '../lib/toast';
import { PreviewHostPage } from './PreviewHostPage';
import { applyQuizStageTypography } from '../lib/host/quiz-stage-font';
import '../styles/builder.css';

function heroBackgroundStyle(bg: string | null): CSSProperties {
  if (!bg) return {};
  const overlay = 'linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.45))';
  if (bg.startsWith('gradient:')) {
    return {
      backgroundImage: `${overlay}, ${bg.slice('gradient:'.length)}`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundImage: `${overlay}, url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/** Сворачиваемый блок настроек в редакторе вопроса. */
function BuilderFold(props: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="builder-fold" open={props.defaultOpen || undefined}>
      <summary className="builder-fold__summary">
        <span className="builder-fold__title">{props.title}</span>
        {props.hint ? <span className="builder-fold__hint">{props.hint}</span> : null}
      </summary>
      <div className="builder-fold__body">{props.children}</div>
    </details>
  );
}

function hasQuestionMedia(q: {
  media?: { image?: string | null; video?: string; audio?: string };
}): boolean {
  const m = q.media;
  return !!(m?.image || (m?.video || '').trim() || (m?.audio || '').trim());
}

function hasQuestionExplanation(q: {
  explanation?: { text?: string; image?: string | null; video?: string };
}): boolean {
  const e = q.explanation;
  return !!(e?.text?.trim() || e?.image || (e?.video || '').trim());
}

export function BuilderPage() {
  const b = useBuilderDraft();
  const { toggle: toggleTest, playingUrl } = useTestAudio();
  const musicFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const videoUploadTargetRef = useRef<'media' | 'explanation'>('media');
  const importTxtRef = useRef<HTMLInputElement>(null);
  const importRoundTxtRef = useRef<HTMLInputElement>(null);
  const musicTargetRef = useRef<MusicUploadTarget | null>(null);
  const [bgModal, setBgModal] = useState<{ open: boolean; target: BgTarget | null; src: string | null }>({
    open: false,
    target: null,
    src: null,
  });
  const [gradModal, setGradModal] = useState<{ open: boolean; target: BgTarget | null }>({
    open: false,
    target: null,
  });
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!b.previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') b.closePreview();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [b.previewOpen, b.closePreview]);

  useEffect(() => {
    applyQuizStageTypography({
      fontFamily: b.quizDraft.fontFamily,
      stageTypeStyles: b.quizDraft.stageTypeStyles,
    });
  }, [b.quizDraft.fontFamily, b.quizDraft.stageTypeStyles]);

  useEffect(() => {
    if (b.ui.step !== 3 && b.ui.step !== 4) return;
    const stepEl = document.getElementById(b.ui.step === 3 ? 'step2' : 'step3');
    if (!stepEl) return;
    const topbar = document.querySelector('.landing-nav.topbar');
    const topbarH = topbar?.getBoundingClientRect().height ?? 72;
    const y = stepEl.getBoundingClientRect().top + window.scrollY - topbarH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, [b.ui.step]);

  usePanelScrollChain(b.ui.step);

  if (!b.booted) {
    return (
      <>
        {!b.previewOpen && <Topbar />}
        <div className="container builder-shell">
          <p className="muted">Загрузка редактора…</p>
        </div>
      </>
    );
  }

  const qb = (b.quizDraft.background || '').trim();
  const round = b.activeRound!;
  const q = b.activeQuestion!;
  const rb = (round.background || '').trim();
  const roundBgShown = rb || qb;
  const roundBgIsFallback = !rb && !!qb;

  const openMusicUpload = (target: MusicUploadTarget) => {
    musicTargetRef.current = target;
    if (!musicFileRef.current) {
      toast('Не найден musicUploadFile');
      return;
    }
    musicFileRef.current.value = '';
    musicFileRef.current.click();
  };

  const mutQuestion = (mutator: (qq: typeof q) => void) => {
    b.updateDraft((d) => {
      const qq = d.rounds[b.ui.activeRoundIdx].questions[b.ui.activeQuestionIdx];
      mutator(qq);
    });
  };

  const steps = [
    { n: 1 as const, title: 'Квиз', sub: 'Название и фон' },
    { n: 2 as const, title: 'Шрифты', sub: 'Все сцены сразу' },
    { n: 3 as const, title: 'Раунды', sub: 'Структура игры' },
    { n: 4 as const, title: 'Вопросы', sub: 'Контент и ответы' },
  ];

  return (
    <>
      {!b.previewOpen && <Topbar />}
      <div
        className={`container builder-shell${b.ui.step === 3 || b.ui.step === 4 ? ' builder-shell--workbench' : ''}`}
      >

      <div className="wizard">
        <div className="steps" id="wizardSteps">
          {steps.map((s) => (
            <div
              key={s.n}
              className={
                'step' +
                (b.ui.step === s.n ? ' active' : '') +
                (b.stepDone(s.n) ? ' done' : '')
              }
              onClick={() => b.setStep(s.n)}
            >
              <div className="step-num">{s.n}</div>
              <div>
                <div className="step-title">{s.title}</div>
                <div className="step-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="wizard-actions">
          <button className="btn" id="btnPrev" disabled={b.ui.step === 1} onClick={() => b.setStep(b.ui.step - 1)}>
            Назад
          </button>
          <button className="btn" id="btnNext" disabled={b.ui.step === 4} onClick={() => b.setStep(b.ui.step + 1)}>
            Далее
          </button>
          <button
            className="btn primary good"
            id="btnSaveQuiz"
            type="button"
            disabled={b.saving}
            onClick={() => b.saveToServer()}
          >
            {b.saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button className="btn" id="btnExportJson" onClick={() => b.exportJson()}>
            JSON
          </button>
          <button
            className="btn primary"
            id="btnPreview"
            disabled={!b.canOpenPreview()}
            onClick={() => b.openPreview()}
          >
            Предпросмотр
          </button>
        </div>
      </div>

      {/* STEP 1 */}
      <div className="card center-card" id="step1" style={{ display: b.ui.step === 1 ? '' : 'none' }}>
        <div className="hero-preview" id="hero" style={heroBackgroundStyle(b.quizDraft.background)}>
          <div>
            <h1
              id="heroTitle"
              style={b.quizDraft.fontFamily ? { fontFamily: b.quizDraft.fontFamily } : undefined}
            >
              {(b.quizDraft.title || 'Название квиза').trim() || 'Название квиза'}
            </h1>
          </div>
        </div>
        <div style={{ height: 14 }} />
        <div className="field">
          <label>Название квиза</label>
          <input
            id="quizTitle"
            placeholder="Например: Квиз про кино"
            value={b.quizDraft.title}
            onChange={(e) => b.updateDraft((d) => { d.title = e.target.value; })}
          />
        </div>
        <div className="field">
          <label>Описание квиза</label>
          <textarea
            id="quizDescription"
            rows={4}
            placeholder="Кратко для карточки в списке «Мои квизы»"
            value={b.quizDraft.description}
            onChange={(e) => b.updateDraft((d) => { d.description = e.target.value; })}
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
          Шрифты заголовков, ответов и подписей на всех сценах — на вкладке «Шрифты».
        </div>
        <div className="field">
          <label>Фоновое изображение (опционально)</label>
          <PasteImageZone
            className="file-row"
            onImageFile={async (file) => {
              const src = await fileToDataUrl(file);
              setBgModal({ open: true, target: 'quiz', src });
            }}
          >
            <input
              id="quizBgFile"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const src = await fileToDataUrl(file);
                setBgModal({ open: true, target: 'quiz', src });
              }}
            />
            <button
              className="btn"
              id="btnEditQuizBg"
              type="button"
              style={{ display: qb && !qb.startsWith('gradient:') ? '' : 'none' }}
              onClick={() => {
                if (!qb) return;
                if (qb.startsWith('gradient:')) setGradModal({ open: true, target: 'quiz' });
                else setBgModal({ open: true, target: 'quiz', src: qb });
              }}
            >
              Кадр
            </button>
            <button
              className="btn"
              id="btnGradientQuizBg"
              type="button"
              onClick={() => setGradModal({ open: true, target: 'quiz' })}
            >
              {qb.startsWith('gradient:') ? 'Градиент…' : 'Градиент'}
            </button>
            <button
              className="btn"
              id="btnClearQuizBg"
              type="button"
              onClick={() => b.updateDraft((d) => { d.background = null; })}
            >
              Сбросить фон
            </button>
          </PasteImageZone>
        </div>
        <div className="field">
          <label>Музыка финальных итогов (URL, опционально)</label>
          <div className="file-row">
            <input
              id="quizFinalMusic"
              placeholder="https://..."
              value={b.quizDraft.finalMusic || ''}
              onChange={(e) => b.updateDraft((d) => { d.finalMusic = e.target.value; })}
            />
            <button
              className="btn"
              id="btnUploadFinalMusic"
              type="button"
              disabled={uploadingLabel === 'quizFinalMusic'}
              onClick={() => openMusicUpload('quizFinalMusic')}
            >
              {uploadingLabel === 'quizFinalMusic' ? 'Загрузка…' : 'Загрузить'}
            </button>
            <button
              className="btn"
              id="btnTestFinalMusic"
              type="button"
              onClick={() => toggleTest(b.quizDraft.finalMusic || '')}
            >
              {playingUrl === (b.quizDraft.finalMusic || '').trim() && playingUrl ? 'Стоп' : 'Тест'}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Воспроизводится только у ведущего на экране «Финальные итоги». Музыка зациклена.
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" type="button" onClick={() => b.setStep(2)}>
            Далее: шрифты сцены
          </button>
        </div>
      </div>

      {/* STEP 2 — шрифты всех сцен */}
      <div className="card center-card center-card--wide" id="stepFonts" style={{ display: b.ui.step === 2 ? '' : 'none' }}>
        <h2 style={{ margin: '0 0 6px' }}>Шрифты на всех сценах</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Однотипные объекты — заголовки, ответы, подписи вроде «Правильный ответ» — меняются сразу везде.
          В редакторе сцены у вопроса по-прежнему можно переопределить отдельный блок.
        </div>
        <StageTypeStylesEditor
          fontFamily={b.quizDraft.fontFamily}
          stageTypeStyles={b.quizDraft.stageTypeStyles}
          onFontFamily={(fontFamily) => b.updateDraft((d) => { d.fontFamily = fontFamily; })}
          onStageTypeStyles={(stageTypeStyles) => b.updateDraft((d) => { d.stageTypeStyles = stageTypeStyles; })}
        />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary" type="button" onClick={() => b.setStep(3)}>
            Далее: добавить раунды
          </button>
        </div>
      </div>

      {/* STEP 3 */}
      <div className="split" id="step2" style={{ display: b.ui.step === 3 ? '' : 'none' }}>
        <div className="card builder-panel builder-rounds-panel">
          <div className="builder-panel-header">
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0 }}>Раунды</h2>
              <div className="muted" style={{ fontSize: 13 }}>
                Добавьте 1+ раунд и упорядочьте их.
              </div>
            </div>
            <button className="btn primary" id="btnAddRound" onClick={() => b.addRound()}>
              + Добавить раунд
            </button>
          </div>
          </div>
          <div className="builder-panel-scroll nav-list" id="roundsList">
            {b.quizDraft.rounds.map((r, idx) => (
              <div
                key={idx}
                className={
                  'round-item' +
                  (idx === b.ui.activeRoundIdx ? ' active' : '') +
                  (isRoundComplete(r) ? ' is-complete' : ' is-incomplete')
                }
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  b.setUi({ activeRoundIdx: idx, activeQuestionIdx: 0 });
                }}
              >
                <div className="round-head">
                  <div>
                    <div className="title">
                      Раунд {idx + 1}: {r.title || 'Без названия'}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.questions?.length ?? 0} вопрос(ов)
                    </div>
                  </div>
                  <div className="mini-actions">
                    <button
                      className="btn"
                      data-act="up"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (idx === 0) return;
                        b.updateDraft(
                          (d) => {
                            const tmp = d.rounds[idx - 1];
                            d.rounds[idx - 1] = d.rounds[idx];
                            d.rounds[idx] = tmp;
                          },
                          { activeRoundIdx: idx - 1 },
                        );
                      }}
                    >
                      ↑
                    </button>
                    <button
                      className="btn"
                      data-act="down"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (idx === b.quizDraft.rounds.length - 1) return;
                        b.updateDraft(
                          (d) => {
                            const tmp = d.rounds[idx + 1];
                            d.rounds[idx + 1] = d.rounds[idx];
                            d.rounds[idx] = tmp;
                          },
                          { activeRoundIdx: idx + 1 },
                        );
                      }}
                    >
                      ↓
                    </button>
                    <button
                      className="btn bad"
                      data-act="del"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (b.quizDraft.rounds.length === 1) {
                          toast('Должен быть хотя бы один раунд');
                          return;
                        }
                        b.updateDraft((d) => {
                          d.rounds.splice(idx, 1);
                        });
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card builder-panel builder-round-editor-panel">
          <div className="builder-panel-scroll">
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Настройки раунда</h2>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <input
                id="importRoundTxtFile"
                ref={importRoundTxtRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await b.importRoundTxt(file);
                  e.target.value = '';
                }}
              />
              <button
                className="btn"
                id="btnImportRoundTxt"
                type="button"
                onClick={() => {
                  if (!importRoundTxtRef.current) return;
                  importRoundTxtRef.current.value = '';
                  importRoundTxtRef.current.click();
                }}
              >
                Импорт TXT
              </button>
              <button
                className="btn"
                id="btnExportRoundTxt"
                type="button"
                onClick={() => b.exportRoundTxt(b.ui.activeRoundIdx)}
              >
                Сохранить TXT
              </button>
            </div>
          </div>
          <details className="muted" style={{ fontSize: 12, margin: '10px 0 14px' }}>
            <summary style={{ cursor: 'pointer' }}>Формат TXT (настройки + вопросы, без медиа)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12 }}>{ROUND_CONFIG_TXT_HELP}</pre>
          </details>

          <section className="builder-section">
            <div className="builder-section__title">Раунд</div>
            <div className="field">
              <label>Название раунда</label>
              <input
                id="roundTitle"
                placeholder="Например: Разминка"
                value={round.title || ''}
                onChange={(e) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].title = e.target.value;
                  })
                }
              />
            </div>
            <div className="field">
              <label>Описание / правила раунда</label>
              <textarea
                id="roundDesc"
                rows={5}
                placeholder="Например: в этом раунде отвечаем быстро, без подсказок"
                value={round.description || ''}
                onChange={(e) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].description = e.target.value;
                  })
                }
              />
            </div>
          </section>

          <BuilderFold title="Время вопросов">
            <div className="row">
              <div className="col">
                <div className="field">
                  <label>Время ответа по умолчанию (сек)</label>
                  <NumericSpinnerInput
                    id="roundDefaultTimer"
                    value={round.defaultTimer ?? 15}
                    fallback={15}
                    onChange={(v) =>
                      b.updateDraft((d) => {
                        d.rounds[b.ui.activeRoundIdx].defaultTimer = v;
                      })
                    }
                  />
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Время на прочтение по умолчанию (сек)</label>
                  <NumericSpinnerInput
                    id="roundDefaultReadSec"
                    value={round.defaultReadSec ?? 3}
                    fallback={3}
                    onChange={(v) =>
                      b.updateDraft((d) => {
                        d.rounds[b.ui.activeRoundIdx].defaultReadSec = v;
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Время применяется ко всем вопросам раунда, пока для вопроса не задано своё.
            </div>
          </BuilderFold>

          <BuilderFold title="Цена вопроса по умолчанию">
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Отдельная цена для каждого типа. На вопросе можно переопределить.
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              {BUILDER_QUESTION_TYPES.map((type) => (
                <div className="col" key={type} style={{ minWidth: 150, flex: '1 1 150px' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`roundDefaultPoints-${type}`}>
                      {BUILDER_QUESTION_TYPE_LABELS[type]}
                    </label>
                    <NumericSpinnerInput
                      id={`roundDefaultPoints-${type}`}
                      value={roundDefaultPointsForType(round, type)}
                      min={0}
                      fallback={1}
                      onChange={(v) =>
                        b.updateDraft((d) => {
                          setRoundDefaultPointsForType(d.rounds[b.ui.activeRoundIdx], type, v);
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </BuilderFold>

          <BuilderFold
            title="Ставки в начале раунда"
            hint={round.bettingEnabled ? 'вкл.' : undefined}
          >
            <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={round.bettingEnabled === true}
                onChange={(e) =>
                  b.updateDraft((d) => {
                    const r = d.rounds[b.ui.activeRoundIdx];
                    r.bettingEnabled = e.target.checked;
                    if (!e.target.checked) resetBettingSettings(r);
                  })
                }
              />
              Ставки в начале раунда
            </label>
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Ставка одна на весь раунд — игроки подтверждают её на экране intro. Для ставки только на отдельные
              вопросы оставьте выключенным и включите на нужных вопросах.
            </div>
            {round.bettingEnabled ? (
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <BettingSettings
                  idPrefix={`round${b.ui.activeRoundIdx}`}
                  value={round}
                  onChange={(mutate) =>
                    b.updateDraft((d) => {
                      mutate(d.rounds[b.ui.activeRoundIdx]);
                    })
                  }
                />
              </div>
            ) : null}
          </BuilderFold>

          <BuilderFold title="Экраны и показ ответов">
            <div className="field">
              <label>Показать экран раунда (сек)</label>
              <NumericSpinnerInput
                id="roundIntroSec"
                value={round.introSec || 6}
                fallback={6}
                onChange={(v) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].introSec = v;
                  })
                }
              />
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Сначала показываем название + правила раунда, затем автоматически переходим к вопросам.
              </div>
            </div>
            <div className="field">
              <label>Показ ответов</label>
              <select
                id="roundAnswerRevealMode"
                value={round.answerRevealMode || 'per_question'}
                onChange={(e) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].answerRevealMode =
                      e.target.value === 'end_of_round' ? 'end_of_round' : 'per_question';
                  })
                }
              >
                <option value="per_question">После каждого вопроса</option>
                <option value="end_of_round">В конце раунда (быстрый повтор)</option>
              </select>
            </div>
            <div className="field">
              <label>Время показа правильного ответа (сек)</label>
              <NumericSpinnerInput
                id="roundSummarySec"
                value={round.summarySec || 2}
                fallback={2}
                onChange={(v) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].summarySec = v;
                  })
                }
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Время показа итогов раунда (сек)</label>
              <NumericSpinnerInput
                id="roundLeaderboardSec"
                value={round.leaderboardSec == null ? 6 : round.leaderboardSec}
                fallback={6}
                onChange={(v) =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].leaderboardSec = v;
                  })
                }
              />
            </div>
          </BuilderFold>

          <BuilderFold
            title="Фон раунда"
            hint={rb ? 'задан' : 'как у квиза'}
          >
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Если не задан — на сцене будет заставка квиза.
            </div>
            <PasteImageZone
              className="file-row"
              onImageFile={async (file) => {
                const src = await fileToDataUrl(file);
                setBgModal({ open: true, target: 'round', src });
              }}
            >
              <div
                className="thumb"
                id="roundBgThumb"
                title={roundBgIsFallback ? 'Заставка квиза' : undefined}
                style={
                  roundBgShown.startsWith('gradient:')
                    ? {
                        backgroundImage: roundBgShown.slice('gradient:'.length),
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              >
                {!roundBgShown || roundBgShown.startsWith('gradient:') ? (
                  <span>{roundBgIsFallback ? 'как у квиза' : 'gradient'}</span>
                ) : (
                  <img src={roundBgShown} alt="" />
                )}
              </div>
              <input
                id="roundBgFile"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const src = await fileToDataUrl(file);
                  setBgModal({ open: true, target: 'round', src });
                }}
              />
              <button
                className="btn"
                id="btnEditRoundBg"
                type="button"
                style={{ display: rb && !rb.startsWith('gradient:') ? '' : 'none' }}
                onClick={() => {
                  if (!rb) return;
                  if (rb.startsWith('gradient:')) setGradModal({ open: true, target: 'round' });
                  else setBgModal({ open: true, target: 'round', src: rb });
                }}
              >
                Кадр
              </button>
              <button
                className="btn"
                id="btnGradientRoundBg"
                type="button"
                onClick={() => setGradModal({ open: true, target: 'round' })}
              >
                {rb.startsWith('gradient:') ? 'Градиент…' : 'Градиент'}
              </button>
              <button
                className="btn"
                id="btnClearRoundBg"
                type="button"
                onClick={() =>
                  b.updateDraft((d) => {
                    d.rounds[b.ui.activeRoundIdx].background = null;
                  })
                }
              >
                Сбросить фон
              </button>
            </PasteImageZone>
          </BuilderFold>

          <BuilderFold
            title="Музыка раунда"
            hint={
              (round.music || '').trim() || (round.leaderboardMusic || '').trim()
                ? 'заполнено'
                : 'только у ведущего'
            }
          >
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Музыка зациклена. Музыка вопроса может временно переопределять музыку раунда.
            </div>
            <div className="row">
              <div className="col">
                <div className="field">
                  <label>Музыка раунда URL (опц.)</label>
                  <div className="file-row">
                    <input
                      id="roundMusic"
                      placeholder="https://..."
                      value={round.music || ''}
                      onChange={(e) =>
                        b.updateDraft((d) => {
                          d.rounds[b.ui.activeRoundIdx].music = e.target.value;
                        })
                      }
                    />
                    <button
                      className="btn"
                      id="btnUploadRoundMusic"
                      type="button"
                      onClick={() => openMusicUpload('roundMusic')}
                    >
                      Загрузить
                    </button>
                    <button
                      className="btn"
                      id="btnTestRoundMusic"
                      type="button"
                      onClick={() => toggleTest(round.music || '')}
                    >
                      {playingUrl === (round.music || '').trim() && playingUrl ? 'Стоп' : 'Тест'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="col">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Музыка итогов раунда URL (опц.)</label>
                  <div className="file-row">
                    <input
                      id="roundLeaderboardMusic"
                      placeholder="https://..."
                      value={round.leaderboardMusic || ''}
                      onChange={(e) =>
                        b.updateDraft((d) => {
                          d.rounds[b.ui.activeRoundIdx].leaderboardMusic = e.target.value;
                        })
                      }
                    />
                    <button
                      className="btn"
                      id="btnUploadRoundLeaderboardMusic"
                      type="button"
                      onClick={() => openMusicUpload('roundLeaderboardMusic')}
                    >
                      Загрузить
                    </button>
                    <button
                      className="btn"
                      id="btnTestRoundLeaderboardMusic"
                      type="button"
                      onClick={() => toggleTest(round.leaderboardMusic || '')}
                    >
                      {playingUrl === (round.leaderboardMusic || '').trim() && playingUrl
                        ? 'Стоп'
                        : 'Тест'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </BuilderFold>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn primary" type="button" onClick={() => b.setStep(4)}>
              Далее: добавить вопросы
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* STEP 4 */}
      <div className="split" id="step3" style={{ display: b.ui.step === 4 ? '' : 'none' }}>
        <div className="card builder-panel builder-questions-panel">
          <div className="builder-panel-header">
          <div className="field">
            <label>Раунд</label>
            <select
              id="roundPicker"
              value={String(b.ui.activeRoundIdx)}
              onChange={(e) =>
                b.setUi({ activeRoundIdx: Number(e.target.value || '0'), activeQuestionIdx: 0 })
              }
            >
              {b.quizDraft.rounds.map((r, idx) => (
                <option key={idx} value={String(idx)}>
                  Раунд {idx + 1}: {r.title || 'Без названия'}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: 0 }}>Вопросы</h2>
              <div className="muted" style={{ fontSize: 13 }}>
                Каждый вопрос — отдельная карточка. «Добавить из TXT» — только вопросы, в конец списка.
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <input
                id="importTxtFile"
                ref={importTxtRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await b.importTxtAppendQuestions(file);
                }}
              />
              <button
                className="btn"
                id="btnImportTxtAppend"
                type="button"
                onClick={() => {
                  if (!importTxtRef.current) return;
                  importTxtRef.current.value = '';
                  importTxtRef.current.click();
                }}
              >
                Добавить из TXT
              </button>
              <button className="btn primary" id="btnAddQuestion" onClick={() => b.addQuestion()}>
                + Добавить вопрос
              </button>
            </div>
          </div>
          </div>
          <div className="builder-panel-scroll nav-list" id="questionsList">
            {(round.questions || []).map((qq, idx) => {
              const title = (qq.text || '').trim() ? qq.text.trim() : 'Без текста';
              return (
                <div
                  key={idx}
                  className={
                    'q-item' +
                    (idx === b.ui.activeQuestionIdx ? ' active' : '') +
                    (isQuestionComplete(qq) ? ' is-complete' : ' is-incomplete')
                  }
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    b.setUi({ activeQuestionIdx: idx });
                  }}
                >
                  <div className="q-head">
                    <div>
                      <div className="title">
                        Вопрос {idx + 1}: {title.slice(0, 36)}
                        {title.length > 36 ? '…' : ''}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {qq.type} • {effectiveQuestionTimer(round, qq)}s / read{' '}
                        {effectiveQuestionReadSec(round, qq)}s • {effectiveQuestionPoints(round, qq)} pts
                      </div>
                    </div>
                    <div className="mini-actions">
                      <button
                        className="btn"
                        data-act="up"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (idx === 0) return;
                          b.updateDraft(
                            (d) => {
                              const questions = d.rounds[b.ui.activeRoundIdx].questions;
                              const tmp = questions[idx - 1];
                              questions[idx - 1] = questions[idx];
                              questions[idx] = tmp;
                            },
                            { activeQuestionIdx: idx - 1 },
                          );
                        }}
                      >
                        ↑
                      </button>
                      <button
                        className="btn"
                        data-act="down"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (idx === (round.questions || []).length - 1) return;
                          b.updateDraft(
                            (d) => {
                              const questions = d.rounds[b.ui.activeRoundIdx].questions;
                              const tmp = questions[idx + 1];
                              questions[idx + 1] = questions[idx];
                              questions[idx] = tmp;
                            },
                            { activeQuestionIdx: idx + 1 },
                          );
                        }}
                      >
                        ↓
                      </button>
                      <button
                        className="btn bad"
                        data-act="del"
                        onClick={(e) => {
                          e.stopPropagation();
                          if ((round.questions || []).length === 1) {
                            toast('Должен быть хотя бы один вопрос');
                            return;
                          }
                          b.updateDraft((d) => {
                            d.rounds[b.ui.activeRoundIdx].questions.splice(idx, 1);
                          });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card builder-panel builder-editor-panel">
          <div className="builder-panel-scroll">
          <h2>Редактор вопроса</h2>

          <section className="builder-section">
            <div className="builder-section__title">Вопрос</div>
            <div className="field">
              <label>Текст вопроса</label>
              <textarea
                id="qText"
                rows={3}
                placeholder="Например: Кто сыграл Нео в «Матрице»?"
                value={q.text || ''}
                onChange={(e) => mutQuestion((qq) => { qq.text = e.target.value; })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Enter — перенос строки. Шрифт и точная позиция — в блоках ниже или в «Редактировать сцену».
              </div>
            </div>
          </section>

          <section className="builder-section">
            <div className="builder-section__title">Тип вопроса</div>
            <div className="field">
              <select
                id="qType"
                value={q.type}
                onChange={(e) => b.changeQuestionType(e.target.value as typeof q.type)}
              >
                <option value="single">один вариант</option>
                <option value="multiple">несколько вариантов</option>
                <option value="text">текст вручную</option>
                <option value="matching">соответствие</option>
                <option value="hidden">что скрыто на картинке</option>
              </select>
            </div>
            {q.type === 'hidden' && (
              <div className="field" style={{ marginTop: 8 }}>
                <label>Как отвечают игроки</label>
                <div className="row" style={{ gap: 16 }}>
                  <label>
                    <input
                      type="radio"
                      name="hiddenAnswer"
                      checked={q.hiddenAnswer !== 'text'}
                      onChange={() =>
                        mutQuestion((qq) => {
                          qq.hiddenAnswer = 'single';
                          ensureChoiceOptions(qq);
                        })
                      }
                    />{' '}
                    варианты
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="hiddenAnswer"
                      checked={q.hiddenAnswer === 'text'}
                      onChange={() =>
                        mutQuestion((qq) => {
                          qq.hiddenAnswer = 'text';
                          qq.correct = [];
                          qq.options = [];
                        })
                      }
                    />{' '}
                    текст вручную
                  </label>
                </div>
              </div>
            )}
          </section>

          <section
            className="builder-section"
            style={{ display: usesTextAnswers(q) ? 'none' : undefined }}
            id="optionsBlock"
          >
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="builder-section__title" style={{ marginBottom: 4 }}>
                  Варианты ответа
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  Карточка: подпись и/или картинка (хотя бы одно). Правильные — галочкой.
                </div>
              </div>
              <button
                className="btn primary"
                id="btnAddOption"
                type="button"
                style={{ display: q.type === 'matching' ? 'none' : undefined }}
                onClick={() =>
                  mutQuestion((qq) => {
                    qq.options.push({ id: uuid(), label: '', imageUrl: null });
                  })
                }
              >
                + Вариант
              </button>
            </div>
            <div style={{ height: 12 }} />
            <div id="optionsHolder">
              {!usesTextAnswers(q) && <OptionsEditor q={q} onChange={mutQuestion} />}
            </div>
          </section>

          <section
            className="builder-section"
            style={{ display: usesTextAnswers(q) ? undefined : 'none' }}
            id="textCorrectBlock"
          >
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="builder-section__title" style={{ marginBottom: 4 }}>
                  Правильные ответы
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  На экране показывается только первый вариант. Остальные тоже засчитываются
                  (например, «Молли Уизли» и «Молли»).
                </div>
              </div>
              <button
                className="btn primary"
                id="btnAddTextCorrect"
                type="button"
                onClick={() =>
                  mutQuestion((qq) => {
                    qq.correct = qq.correct || [];
                    qq.correct.push('');
                  })
                }
              >
                + Вариант
              </button>
            </div>
            <div style={{ height: 10 }} />
            {usesTextAnswers(q) && <OptionsEditor q={q} onChange={mutQuestion} />}
          </section>

          <BuilderFold title="Время и цена">
            <div className="row">
              <div className="col">
                <div className="field">
                  <label>Время ответа (сек)</label>
                  <InheritNumericSpinnerInput
                    id="qTimer"
                    inherit={q.useRoundTimer !== false}
                    inheritPlaceholder={`Как в настройках раунда (${round.defaultTimer ?? 15} с)`}
                    inheritValue={round.defaultTimer ?? 15}
                    customValue={q.timer || 15}
                    onInherit={() =>
                      mutQuestion((qq) => {
                        qq.useRoundTimer = true;
                      })
                    }
                    onCustom={(v) =>
                      mutQuestion((qq) => {
                        qq.useRoundTimer = false;
                        qq.timer = v;
                      })
                    }
                  />
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Время на прочтение (сек)</label>
                  <InheritNumericSpinnerInput
                    id="qReadSec"
                    inherit={q.useRoundReadSec !== false}
                    inheritPlaceholder={`Как в настройках раунда (${round.defaultReadSec ?? 3} с)`}
                    inheritValue={round.defaultReadSec ?? 3}
                    customValue={q.readSec || 3}
                    onInherit={() =>
                      mutQuestion((qq) => {
                        qq.useRoundReadSec = true;
                      })
                    }
                    onCustom={(v) =>
                      mutQuestion((qq) => {
                        qq.useRoundReadSec = false;
                        qq.readSec = v;
                      })
                    }
                  />
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Цена вопроса (очки)</label>
                  <InheritNumericSpinnerInput
                    id="qPoints"
                    inherit={q.useRoundPoints !== false}
                    inheritPlaceholder={`Как в настройках раунда (${roundDefaultPointsForType(round, q.type)})`}
                    inheritValue={roundDefaultPointsForType(round, q.type)}
                    customValue={q.points == null ? 1 : q.points}
                    min={0}
                    onInherit={() =>
                      mutQuestion((qq) => {
                        qq.useRoundPoints = true;
                      })
                    }
                    onCustom={(v) =>
                      mutQuestion((qq) => {
                        qq.useRoundPoints = false;
                        qq.points = v;
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Шрифт текста вопроса (переопределение)</label>
              <StageFontSelect
                id="qTextFont"
                value={getStageSlotFontFamily(q.stageLayout, 'prompt')}
                onChange={(fontFamily) =>
                  mutQuestion((qq) => {
                    qq.stageLayout = setStageSlotFontFamily(qq.stageLayout, 'prompt', fontFamily);
                  })
                }
              />
            </div>
          </BuilderFold>

          {!round.bettingEnabled ? (
            <BuilderFold
              title="Ставка на вопрос"
              hint={q.bettingEnabled ? 'вкл.' : undefined}
            >
              <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={q.bettingEnabled === true}
                  onChange={(e) =>
                    mutQuestion((qq) => {
                      qq.bettingEnabled = e.target.checked;
                      if (!e.target.checked) resetBettingSettings(qq);
                    })
                  }
                />
                Ставка на этот вопрос
              </label>
              {q.bettingEnabled ? (
                <div style={{ marginTop: 10 }}>
                  <BettingSettings
                    idPrefix={`q${b.ui.activeRoundIdx}-${b.ui.activeQuestionIdx}`}
                    value={q}
                    onChange={(mutate) => mutQuestion((qq) => mutate(qq))}
                  />
                </div>
              ) : null}
            </BuilderFold>
          ) : null}

          <BuilderFold
            title={q.type === 'hidden' ? 'Картинка и медиа' : 'Медиа'}
            hint={hasQuestionMedia(q) ? 'заполнено' : 'опционально'}
          >
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              {q.type === 'hidden'
                ? 'Загрузите картинку. Под ней — кнопки «Добавить плашку» и «Удалить выбранную»: можно закрыть несколько участков. Плашки видит только ведущий.'
                : 'Картинка — файл; видео — загрузка на сервер, прямой URL (mp4/webm) или ссылка «Поделиться» с Google Диска (в поле URL). Аудио — файл или URL. Медиа вопроса видит только ведущий.'}
            </div>
            <PasteImageZone
              className="file-row"
              onImageFile={async (file) => {
                const url = await fileToDataUrl(file);
                mutQuestion((qq) => {
                  qq.media.image = url;
                  if (qq.type === 'hidden' && !qq.imageHideRects?.length && !qq.imageHideRect) {
                    qq.imageHideRects = [{ ...DEFAULT_IMAGE_HIDE_RECT }];
                  }
                });
              }}
            >
              <div className="thumb" id="mediaImgThumb">
                {q.media?.image ? <img src={q.media.image} alt="" /> : <span>none</span>}
              </div>
              <input
                id="mediaImgFile"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await fileToDataUrl(file);
                  mutQuestion((qq) => {
                    qq.media.image = url;
                    if (qq.type === 'hidden' && !qq.imageHideRects?.length && !qq.imageHideRect) {
                      qq.imageHideRects = [{ ...DEFAULT_IMAGE_HIDE_RECT }];
                    }
                  });
                }}
              />
              <button
                className="btn"
                id="btnClearMediaImg"
                type="button"
                onClick={() => mutQuestion((qq) => { qq.media.image = null; })}
              >
                Убрать картинку
              </button>
            </PasteImageZone>
            {q.type === 'hidden' && q.media?.image ? (
              <div style={{ marginTop: 12 }}>
                <ImageHideEditor
                  src={q.media.image}
                  value={q.imageHideRects?.length ? q.imageHideRects : q.imageHideRect}
                  onChange={(rects) =>
                    mutQuestion((qq) => {
                      qq.imageHideRects = rects;
                      qq.imageHideRect = rects[0] || null;
                    })
                  }
                />
              </div>
            ) : null}
            <div style={{ height: 10 }} />
            <div className="row">
              <div className="col">
                <div className="field">
                  <label>Видео к вопросу (опц.)</label>
                  <div className="file-row">
                    <input
                      id="mediaVideo"
                      placeholder="URL или загрузите файл (mp4, webm…)"
                      value={q.media?.video || ''}
                      onChange={(e) =>
                        mutQuestion((qq) => {
                          qq.media.video = e.target.value;
                        })
                      }
                    />
                    <button
                      className="btn"
                      id="btnUploadMediaVideo"
                      type="button"
                      disabled={uploadingLabel === 'video'}
                      onClick={() => {
                        if (!videoFileRef.current) return;
                        videoUploadTargetRef.current = 'media';
                        videoFileRef.current.value = '';
                        videoFileRef.current.click();
                      }}
                    >
                      {uploadingLabel === 'video' ? 'Загрузка…' : 'Загрузить'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Аудио к вопросу (опц.)</label>
                  <div className="file-row">
                    <input
                      id="mediaAudio"
                      placeholder="https://… или загрузите файл"
                      value={q.media?.audio || ''}
                      onChange={(e) =>
                        mutQuestion((qq) => {
                          qq.media.audio = e.target.value;
                        })
                      }
                    />
                    <button
                      className="btn"
                      id="btnUploadMediaAudio"
                      type="button"
                      onClick={() => openMusicUpload('mediaAudio')}
                    >
                      Загрузить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </BuilderFold>

          <BuilderFold
            title="Музыка вопроса"
            hint={(q.music || '').trim() ? 'заполнено' : 'только у ведущего'}
          >
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Если задана, приостанавливает музыку раунда. Музыка зациклена.
            </div>
            <div className="row">
              <div className="col">
                <div className="field">
                  <label>Музыка вопроса URL (опц.)</label>
                  <div className="file-row">
                    <input
                      id="qMusic"
                      placeholder="https://..."
                      value={q.music || ''}
                      onChange={(e) => mutQuestion((qq) => { qq.music = e.target.value; })}
                    />
                    <button
                      className="btn"
                      id="btnUploadQuestionMusic"
                      type="button"
                      onClick={() => openMusicUpload('qMusic')}
                    >
                      Загрузить
                    </button>
                    <button
                      className="btn"
                      id="btnTestQuestionMusic"
                      type="button"
                      onClick={() => toggleTest(q.music || '')}
                    >
                      {playingUrl === (q.music || '').trim() && playingUrl ? 'Стоп' : 'Тест'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="col">
                <div className="field">
                  <label>Продлить на X следующих вопросов (опц.)</label>
                  <NumericSpinnerInput
                    id="qMusicCarry"
                    value={q.musicCarry || 0}
                    min={0}
                    fallback={0}
                    onChange={(v) =>
                      mutQuestion((qq) => {
                        qq.musicCarry = v;
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </BuilderFold>

          <BuilderFold
            title="Пояснение к ответу"
            hint={hasQuestionExplanation(q) ? 'заполнено' : 'экран ведущего'}
          >
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              Покажется под таймером, когда выйдет правильный ответ. Текст, картинка и/или видео. Игроки не видят.
            </div>
            <div className="field">
              <label>Текст пояснения (опц.)</label>
              <textarea
                id="explanationText"
                rows={3}
                placeholder="Почему этот ответ верный"
                value={q.explanation?.text || ''}
                onChange={(e) =>
                  mutQuestion((qq) => {
                    qq.explanation = qq.explanation || { text: '', image: null, video: '' };
                    qq.explanation.text = e.target.value;
                  })
                }
              />
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label>Шрифт пояснения на сцене</label>
                <StageFontSelect
                  value={getStageSlotFontFamily(q.stageLayout, 'explanation')}
                  onChange={(fontFamily) =>
                    mutQuestion((qq) => {
                      qq.stageLayout = setStageSlotFontFamily(qq.stageLayout, 'explanation', fontFamily);
                    })
                  }
                />
              </div>
            </div>
            <div style={{ height: 10 }} />
            <PasteImageZone
              className="file-row"
              onImageFile={async (file) => {
                const url = await fileToDataUrl(file);
                mutQuestion((qq) => {
                  qq.explanation = qq.explanation || { text: '', image: null, video: '' };
                  qq.explanation.image = url;
                });
              }}
            >
              <div className="thumb" id="explanationImgThumb">
                {q.explanation?.image ? <img src={q.explanation.image} alt="" /> : <span>none</span>}
              </div>
              <input
                id="explanationImgFile"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await fileToDataUrl(file);
                  mutQuestion((qq) => {
                    qq.explanation = qq.explanation || { text: '', image: null, video: '' };
                    qq.explanation.image = url;
                  });
                }}
              />
              <button
                className="btn"
                id="btnClearExplanationImg"
                type="button"
                onClick={() =>
                  mutQuestion((qq) => {
                    qq.explanation = qq.explanation || { text: '', image: null, video: '' };
                    qq.explanation.image = null;
                  })
                }
              >
                Убрать картинку
              </button>
            </PasteImageZone>
            <div style={{ height: 10 }} />
            <div className="field">
              <label>Видео пояснения (опц.)</label>
              <div className="file-row">
                <input
                  id="explanationVideo"
                  placeholder="URL или загрузите файл (mp4, webm…)"
                  value={q.explanation?.video || ''}
                  onChange={(e) =>
                    mutQuestion((qq) => {
                      qq.explanation = qq.explanation || { text: '', image: null, video: '' };
                      qq.explanation.video = e.target.value;
                    })
                  }
                />
                <button
                  className="btn"
                  id="btnUploadExplanationVideo"
                  type="button"
                  disabled={uploadingLabel === 'explanationVideo'}
                  onClick={() => {
                    if (!videoFileRef.current) return;
                    videoUploadTargetRef.current = 'explanation';
                    videoFileRef.current.value = '';
                    videoFileRef.current.click();
                  }}
                >
                  {uploadingLabel === 'explanationVideo' ? 'Загрузка…' : 'Загрузить'}
                </button>
              </div>
            </div>
          </BuilderFold>
          </div>
        </div>
      </div>

      {b.previewOpen && b.previewPayload ? (
        <div className="preview-embed" role="dialog" aria-modal="true" aria-label="Предпросмотр">
          <PreviewHostPage
            payload={b.previewPayload}
            onClose={b.closePreview}
            onLayoutCommit={b.applyPreviewStageLayout}
          />
        </div>
      ) : null}

      <BgFrameModal
        open={bgModal.open}
        sourceDataUrl={bgModal.src}
        onCancel={() => setBgModal({ open: false, target: null, src: null })}
        onApply={(dataUrl) => {
          if (bgModal.target === 'quiz') {
            b.updateDraft((d) => {
              d.background = dataUrl;
            });
          } else if (bgModal.target === 'round') {
            b.updateDraft((d) => {
              d.rounds[b.ui.activeRoundIdx].background = dataUrl;
            });
          }
          setBgModal({ open: false, target: null, src: null });
        }}
      />

      <GradModal
        open={gradModal.open}
        initial={
          gradModal.target === 'quiz'
            ? b.quizDraft.background
            : gradModal.target === 'round'
              ? round.background
              : null
        }
        onCancel={() => setGradModal({ open: false, target: null })}
        onApply={(val) => {
          if (gradModal.target === 'quiz') {
            b.updateDraft((d) => {
              d.background = val;
            });
          } else if (gradModal.target === 'round') {
            b.updateDraft((d) => {
              d.rounds[b.ui.activeRoundIdx].background = val;
            });
          }
          setGradModal({ open: false, target: null });
        }}
      />

      <input
        id="musicUploadFile"
        ref={musicFileRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const target = musicTargetRef.current;
          musicTargetRef.current = null;
          if (!target) {
            toast('Не выбран target для загрузки');
            return;
          }
          setUploadingLabel(target);
          try {
            await b.uploadAudio(file, target);
          } catch {
            /* toasted */
          } finally {
            setUploadingLabel(null);
          }
        }}
      />
      <input
        id="videoUploadFile"
        ref={videoFileRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.m4v"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const target = videoUploadTargetRef.current;
          setUploadingLabel(target === 'explanation' ? 'explanationVideo' : 'video');
          try {
            await b.uploadVideo(file, target);
          } catch {
            /* toasted */
          } finally {
            setUploadingLabel(null);
            e.target.value = '';
          }
        }}
      />
    </div>
    </>
  );
}
