import { useCallback, useEffect, useRef, useState } from 'react';
import { optionLetterForIndex } from '../format';
import { toast } from '../toast';
import {
  ensureMatchingShape,
  fileToDataUrl,
  optionIsFilled,
  usesChoiceAnswers,
  usesTextAnswers,
  uuid,
} from './defaults';
import { PasteImageZone } from './PasteImageZone';
import {
  getStageAnswerFontFamily,
  setStageAnswerFontFamily,
} from './stage-layout-style';
import { StageFontSelect } from '../../components/StageFontSelect';
import type { BuilderOption, BuilderQuestion } from './types';

type Props = {
  q: BuilderQuestion;
  onChange: (mutator: (q: BuilderQuestion) => void) => void;
};

export function OptionsEditor({ q, onChange }: Props) {
  if (usesTextAnswers(q)) {
    const values = q.correct?.length ? q.correct : [''];
    const moveCorrect = (idx: number, dir: -1 | 1) => {
      onChange((qq) => {
        const next = [...(qq.correct?.length ? qq.correct : [''])];
        const to = idx + dir;
        if (to < 0 || to >= next.length) return;
        const tmp = next[idx];
        next[idx] = next[to];
        next[to] = tmp;
        qq.correct = next;
      });
    };
    return (
      <div id="textCorrectHolder">
        {values.map((val, idx) => (
          <div className="text-correct-row" key={idx}>
            <div className="text-correct-row__main">
              <textarea
                className="text-correct-input"
                rows={2}
                placeholder={idx === 0 ? 'На экране, например: Молли Уизли' : 'Синоним, тоже засчитывается'}
                value={val}
                onChange={(e) => {
                  onChange((qq) => {
                    const next = [...(qq.correct?.length ? qq.correct : [''])];
                    next[idx] = e.target.value;
                    qq.correct = next;
                  });
                }}
              />
            </div>
            <div className="mini-actions">
              <button
                type="button"
                className="btn"
                disabled={idx === 0}
                aria-label="Выше"
                onClick={() => moveCorrect(idx, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                disabled={idx === values.length - 1}
                aria-label="Ниже"
                onClick={() => moveCorrect(idx, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn bad"
                data-act="del"
                aria-label="Удалить вариант"
                onClick={() => {
                  onChange((qq) => {
                    const next = [...(qq.correct?.length ? qq.correct : [''])];
                    if (next.length <= 1) {
                      qq.correct = [''];
                      return;
                    }
                    next.splice(idx, 1);
                    qq.correct = next;
                  });
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (q.type === 'matching') {
    ensureMatchingShape(q);
    const n = q.matchLeft!.length;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const rowEditor = (side: 'L' | 'R', idx: number) => {
      const arr = side === 'L' ? q.matchLeft! : q.matchRight!;
      const row = arr[idx];
      const tag = side === 'L' ? letters[idx] || String(idx + 1) : String(idx + 1);
      return (
        <div className="opt-card" key={`${side}-${row.id}`}>
          <div className="opt-card__head">
            <span style={{ fontWeight: 900 }}>
              {side === 'L' ? `Буква ${tag}` : `№ ${tag}`}
            </span>
            <div className="mini-actions">
              <button
                type="button"
                className="btn bad"
                onClick={() => {
                  onChange((qq) => {
                    ensureMatchingShape(qq);
                    if ((qq.matchLeft?.length || 0) <= 2) {
                      toast('Минимум 2 пары');
                      return;
                    }
                    qq.matchLeft!.splice(idx, 1);
                    qq.matchRight!.splice(idx, 1);
                    qq.matchCorrect = qq.matchLeft!.map((_, i) => i + 1);
                  });
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="opt-card__body">
            <div className="opt-card__thumb-wrap">
              <div className="opt-card__thumb">
                {(row.imageUrl || '').trim() ? (
                  <img src={row.imageUrl!} alt="" />
                ) : (
                  <span>Нет фото</span>
                )}
              </div>
            </div>
            <div className="opt-card__fields">
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Текст</label>
                <input
                  type="text"
                  className="match-label"
                  placeholder="Подпись"
                  value={row.label || ''}
                  onChange={(e) => {
                    onChange((qq) => {
                      ensureMatchingShape(qq);
                      const target = side === 'L' ? qq.matchLeft! : qq.matchRight!;
                      target[idx].label = e.target.value;
                    });
                  }}
                />
              </div>
              <PasteImageZone
                className="file-row"
                onImageFile={async (file) => {
                  const url = await fileToDataUrl(file);
                  onChange((qq) => {
                    ensureMatchingShape(qq);
                    const target = side === 'L' ? qq.matchLeft! : qq.matchRight!;
                    target[idx].imageUrl = url;
                  });
                }}
              >
                <input
                  type="file"
                  className="match-img"
                  accept="image/*"
                  onChange={async (ev) => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    const url = await fileToDataUrl(file);
                    onChange((qq) => {
                      ensureMatchingShape(qq);
                      const target = side === 'L' ? qq.matchLeft! : qq.matchRight!;
                      target[idx].imageUrl = url;
                    });
                    ev.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn match-clear-img"
                  onClick={() => {
                    onChange((qq) => {
                      ensureMatchingShape(qq);
                      const target = side === 'L' ? qq.matchLeft! : qq.matchRight!;
                      target[idx].imageUrl = null;
                    });
                  }}
                >
                  Сбросить фото
                </button>
              </PasteImageZone>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="match-editor">
        <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
          Верхний ряд — что показывается игроку как «вопросы» (буквы A…), нижний ряд — «ответы»
          (номера 1…). Укажите для каждой буквы, какому номеру ответа она соответствует.
        </div>
        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>Верхний ряд (вопросы)</div>
        <div id="matchLeftHolder">{Array.from({ length: n }, (_, i) => rowEditor('L', i))}</div>
        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>Нижний ряд (ответы)</div>
        <div id="matchRightHolder">{Array.from({ length: n }, (_, i) => rowEditor('R', i))}</div>
        <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>Правильные соответствия</div>
        <div id="matchCorrectHolder">
          {Array.from({ length: n }, (_, i) => {
            const letter = letters[i] || String(i + 1);
            return (
              <div
                className="row"
                key={i}
                style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}
              >
                <span style={{ minWidth: 120, fontWeight: 800 }}>{letter} →</span>
                <select
                  className="match-correct-sel"
                  value={String(q.matchCorrect![i] || i + 1)}
                  onChange={(e) => {
                    onChange((qq) => {
                      ensureMatchingShape(qq);
                      qq.matchCorrect![i] = Number(e.target.value);
                    });
                  }}
                >
                  {Array.from({ length: n }, (_, j) => (
                    <option key={j + 1} value={String(j + 1)}>
                      {j + 1}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="field" style={{ margin: '14px 0 8px' }}>
          <label>Подсчёт очков</label>
          <select
            id="matchScoringModeSel"
            className="match-scoring-mode"
            style={{ maxWidth: '100%', fontSize: 15, padding: '8px 10px' }}
            value={q.matchScoringMode === 'per_match' ? 'per_match' : 'all_or_nothing'}
            onChange={(e) => {
              onChange((qq) => {
                qq.matchScoringMode =
                  e.target.value === 'per_match' ? 'per_match' : 'all_or_nothing';
              });
            }}
          >
            <option value="all_or_nothing">Все пары верны — полные очки за вопрос</option>
            <option value="per_match">За каждую верную пару отдельно (доля от базовых очков)</option>
          </select>
          <div className="muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.35 }}>
            При втором варианте начисляется ⌊очки × верные пары / n⌋.
          </div>
        </div>
        <button
          type="button"
          className="btn"
          id="btnMatchAddRow"
          onClick={() => {
            onChange((qq) => {
              ensureMatchingShape(qq);
              qq.matchLeft!.push({ id: uuid(), label: '', imageUrl: null });
              qq.matchRight!.push({ id: uuid(), label: '', imageUrl: null });
              qq.matchCorrect!.push(qq.matchCorrect!.length + 1);
            });
          }}
        >
          + Пара (строка)
        </button>
      </div>
    );
  }

  // single / multiple
  const options = [...(q.options || [])];
  while (options.length < 2) options.push({ id: uuid(), label: '', imageUrl: null });
  const correctSet = new Set(q.correct || []);

  return (
    <>
      {options.map((opt, idx) => {
        const filled = optionIsFilled(opt);
        return (
          <div className="opt-card" key={opt.id}>
            <div className="opt-card__head">
              <label className="opt-card__correct">
                <span className="opt-card__letter" aria-hidden="true">
                  {optionLetterForIndex(idx)}
                </span>
                <input
                  className="opt-check"
                  type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                  name="correctOpt"
                  checked={correctSet.has(opt.id)}
                  onChange={(e) => {
                    onChange((qq) => {
                      if (qq.type !== 'multiple') {
                        if (e.target.checked) qq.correct = [opt.id];
                        return;
                      }
                      const set = new Set(qq.correct || []);
                      if (e.target.checked) set.add(opt.id);
                      else set.delete(opt.id);
                      qq.correct = Array.from(set);
                    });
                  }}
                />
                <span>Правильный ответ</span>
              </label>
              <div className="mini-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={idx === 0}
                  onClick={() => {
                    onChange((qq) => {
                      const tmp = qq.options[idx - 1];
                      qq.options[idx - 1] = qq.options[idx];
                      qq.options[idx] = tmp;
                    });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={idx === options.length - 1}
                  onClick={() => {
                    onChange((qq) => {
                      const tmp = qq.options[idx + 1];
                      qq.options[idx + 1] = qq.options[idx];
                      qq.options[idx] = tmp;
                    });
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn bad"
                  onClick={() => {
                    onChange((qq) => {
                      if (qq.options.length <= 2) {
                        toast('Минимум 2 варианта');
                        return;
                      }
                      qq.options.splice(idx, 1);
                      qq.correct = (qq.correct || []).filter((id) => id !== opt.id);
                    });
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="opt-card__body">
              <div className="opt-card__thumb-wrap">
                <div className="opt-card__thumb">
                  {(opt.imageUrl || '').trim() ? (
                    <img src={opt.imageUrl!} alt="" />
                  ) : (
                    <span>Нет фото</span>
                  )}
                </div>
              </div>
              <div className="opt-card__fields">
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Подпись (если без текста — достаточно изображения)</label>
                  <textarea
                    className="opt-label"
                    rows={2}
                    placeholder="Текст на кнопке"
                    value={opt.label || ''}
                    onChange={(e) => {
                      onChange((qq) => {
                        qq.options[idx].label = e.target.value;
                      });
                    }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Шрифт на сцене</label>
                  <StageFontSelect
                    value={getStageAnswerFontFamily(q.stageLayout, opt.id)}
                    onChange={(fontFamily) => {
                      onChange((qq) => {
                        qq.stageLayout = setStageAnswerFontFamily(qq.stageLayout, opt.id, fontFamily);
                      });
                    }}
                  />
                </div>
                <PasteImageZone
                  className="file-row"
                  onImageFile={async (file) => {
                    const url = await fileToDataUrl(file);
                    onChange((qq) => {
                      qq.options[idx].imageUrl = url;
                    });
                  }}
                >
                  <input
                    type="file"
                    className="opt-img"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await fileToDataUrl(file);
                      onChange((qq) => {
                        qq.options[idx].imageUrl = url;
                      });
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn opt-clear-img"
                    onClick={() => {
                      onChange((qq) => {
                        qq.options[idx].imageUrl = null;
                      });
                    }}
                  >
                    Сбросить фото
                  </button>
                </PasteImageZone>
                <div className="muted opt-card__hint" style={{ fontSize: 12, marginTop: 8 }}>
                  {filled
                    ? 'Ок: есть текст или изображение.'
                    : 'Заполните текст или загрузите изображение.'}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

const GRAD_PRESETS: [string, string, number][] = [
  ['#7c3aed', '#22c55e', 135],
  ['#ff7a18', '#af002d', 135],
  ['#06b6d4', '#3b82f6', 135],
  ['#22c55e', '#f59e0b', 135],
  ['#f43f5e', '#8b5cf6', 135],
  ['#111827', '#374151', 135],
  ['#0ea5e9', '#22c55e', 135],
  ['#fb7185', '#f59e0b', 135],
  ['#a3e635', '#06b6d4', 135],
  ['#6366f1', '#f97316', 135],
];

export function useTestAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef('');
  const [playingUrl, setPlayingUrl] = useState('');

  const ensure = () => {
    if (audioRef.current) return audioRef.current;
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.loop = true;
      a.volume = 0.8;
      audioRef.current = a;
      return a;
    } catch {
      return null;
    }
  };

  const toggle = useCallback(async (url: string) => {
    const u = String(url || '').trim();
    const a = ensure();
    if (!a) {
      toast('Тест аудио недоступен в этом браузере');
      return;
    }
    if (!u) {
      toast('Укажите URL трека');
      return;
    }
    try {
      if (!a.paused && urlRef.current === u) {
        a.pause();
        a.removeAttribute('src');
        a.load();
        urlRef.current = '';
        setPlayingUrl('');
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      a.pause();
    } catch {
      /* ignore */
    }
    urlRef.current = u;
    setPlayingUrl(u);
    try {
      a.crossOrigin = 'anonymous';
      a.src = u;
      a.load();
      a.currentTime = 0;
      await a.play().catch((e: Error) => {
        urlRef.current = '';
        setPlayingUrl('');
        toast(
          'Трек не воспроизводится: ' +
            (e?.message || 'Не удалось запустить аудио') +
            '. Проверь, что URL ведёт на прямой аудиофайл (mp3/ogg/wav), а не на страницу/плеер.',
        );
      });
    } catch {
      urlRef.current = '';
      setPlayingUrl('');
      toast('Трек не воспроизводится. Проверь, что URL ведёт на прямой аудиофайл (mp3/ogg/wav).');
    }
  }, []);

  return { toggle, playingUrl };
}

type BgTarget = 'quiz' | 'round';

export function BgFrameModal({
  open,
  sourceDataUrl,
  onCancel,
  onApply,
}: {
  open: boolean;
  sourceDataUrl: string | null;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const zoomRef = useRef(1.2);
  const drag = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    offX: 0,
    offY: 0,
    startOffX: 0,
    startOffY: 0,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = imgRef.current;
    if (!img) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const cover = Math.max(cw / iw, ch / ih);
    const scale = cover * zoomRef.current;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2 + drag.current.offX;
    const dy = (ch - dh) / 2 + drag.current.offY;
    ctx.drawImage(img, dx, dy, dw, dh);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }, []);

  useEffect(() => {
    if (!open || !sourceDataUrl) return;
    zoomRef.current = 1.2;
    setZoom(1.2);
    drag.current.offX = 0;
    drag.current.offY = 0;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    img.src = sourceDataUrl;
  }, [open, sourceDataUrl, draw]);

  useEffect(() => {
    if (open) draw();
  }, [open, zoom, draw]);

  if (!open) return null;

  return (
    <div className="modal-backdrop show" id="bgModal">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Выбрать кадр фона">
        <div className="modal-header">
          <div className="brand-inscription brand-inscription--modal-title">Выбрать кадр фона</div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" id="bgCancel" type="button" onClick={onCancel}>
              Отмена
            </button>
            <button
              className="btn primary"
              id="bgApply"
              type="button"
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                onApply(canvas.toDataURL('image/jpeg', 0.92));
              }}
            >
              Применить
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="bg-frame">
            <canvas
              id="bgCanvas"
              ref={canvasRef}
              width={1400}
              height={600}
              aria-label="Предпросмотр кадра"
              onPointerDown={(e) => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                drag.current.dragging = true;
                drag.current.startX = e.clientX;
                drag.current.startY = e.clientY;
                drag.current.startOffX = drag.current.offX;
                drag.current.startOffY = drag.current.offY;
                try {
                  canvas.setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
              }}
              onPointerMove={(e) => {
                if (!drag.current.dragging) return;
                const canvas = canvasRef.current;
                if (!canvas) return;
                const dx = e.clientX - drag.current.startX;
                const dy = e.clientY - drag.current.startY;
                const rect = canvas.getBoundingClientRect();
                const kx = rect.width ? canvas.width / rect.width : 1;
                const ky = rect.height ? canvas.height / rect.height : 1;
                drag.current.offX = drag.current.startOffX + dx * kx;
                drag.current.offY = drag.current.startOffY + dy * ky;
                draw();
              }}
              onPointerUp={() => {
                drag.current.dragging = false;
              }}
              onPointerCancel={() => {
                drag.current.dragging = false;
              }}
            />
          </div>
          <div className="bg-controls">
            <div className="field" style={{ margin: 0 }}>
              <label>Масштаб</label>
              <input
                id="bgZoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => {
                  const nextZoom = Number(e.target.value || '1.2');
                  zoomRef.current = nextZoom;
                  setZoom(nextZoom);
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Перетаскивайте мышью/тачем, чтобы сдвинуть кадр.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GradModal({
  open,
  initial,
  onCancel,
  onApply,
}: {
  open: boolean;
  initial: string | null | undefined;
  onCancel: () => void;
  onApply: (val: string) => void;
}) {
  const [c1, setC1] = useState('#7c3aed');
  const [c2, setC2] = useState('#22c55e');
  const [angle, setAngle] = useState(135);

  useEffect(() => {
    if (!open) return;
    let nc1 = '#7c3aed';
    let nc2 = '#22c55e';
    let nangle = 135;
    if (initial && String(initial).trim().startsWith('gradient:')) {
      const g = String(initial).trim().slice('gradient:'.length);
      const m = /linear-gradient\((\d+)\s*deg\s*,\s*([^,]+)\s*,\s*([^)]+)\)/i.exec(g);
      if (m) {
        nangle = Number(m[1]) || 135;
        nc1 = String(m[2]).trim();
        nc2 = String(m[3]).trim();
      }
    }
    setC1(nc1);
    setC2(nc2);
    setAngle(nangle);
  }, [open, initial]);

  if (!open) return null;
  const css = `linear-gradient(${angle}deg, ${c1}, ${c2})`;

  return (
    <div className="modal-backdrop show" id="gradModal">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Градиент фона">
        <div className="modal-header">
          <div style={{ fontWeight: 900 }}>Градиент фона</div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" id="gradCancel" type="button" onClick={onCancel}>
              Отмена
            </button>
            <button
              className="btn primary"
              id="gradApply"
              type="button"
              onClick={() => onApply('gradient:' + css)}
            >
              Применить
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div
            className="grad-preview"
            id="gradPreview"
            aria-label="Предпросмотр градиента"
            style={{ backgroundImage: css }}
          />
          <div className="grad-grid" id="gradPalette" aria-label="Палитра градиентов">
            {GRAD_PRESETS.map((p, i) => (
              <div
                key={i}
                className="grad-swatch"
                style={{ backgroundImage: `linear-gradient(${p[2]}deg, ${p[0]}, ${p[1]})` }}
                onClick={() => {
                  setC1(p[0]);
                  setC2(p[1]);
                  setAngle(p[2]);
                }}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Цвет 1</label>
              <input id="gradC1" type="color" value={c1} onChange={(e) => setC1(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Цвет 2</label>
              <input id="gradC2" type="color" value={c2} onChange={(e) => setC2(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0, flex: '1 1 260px' }}>
              <label>Угол</label>
              <input
                id="gradAngle"
                type="range"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value || '135') || 135)}
              />
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                <span id="gradAngleLabel">{angle}°</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { BgTarget, BuilderOption };
