import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bold, ChevronLeft, ChevronRight, GripHorizontal, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Link2, Link2Off } from 'lucide-react';
import { eachStageBox, type StageBox, type StageLayout } from '../lib/host/stage-layout';
import { StageFontSelect } from './StageFontSelect';
import { alignBoxToBox, alignBoxToStage, boxSizePx, centerBoxOnStage, clampPanelPos, imageSlotKeysFromStage, setBoxSizePx, type BoxAnchor, type PanelPos } from '../lib/host/stage-layout-edit';

function clampSlider(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function snapSlider(n: number, step: number): number {
  const stepped = Math.round(n / step) * step;
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return Number(stepped.toFixed(decimals));
}

function InspectorSlider(props: {
  name: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const { name, display, value, min, max, onChange } = props;
  const step = props.step ?? 1;
  const valueRef = useRef(value);
  valueRef.current = value;
  const holdRef = useRef<number | null>(null);

  const stopHold = () => {
    if (holdRef.current != null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };

  useEffect(() => () => stopHold(), []);

  const nudge = (dir: -1 | 1) => {
    const next = clampSlider(snapSlider(valueRef.current + dir * step, step), min, max);
    if (next === valueRef.current) return false;
    onChange(next);
    return true;
  };

  const startHold = (dir: -1 | 1) => {
    stopHold();
    if (!nudge(dir)) return;
    const tick = () => {
      holdRef.current = window.setTimeout(() => {
        if (!nudge(dir)) {
          stopHold();
          return;
        }
        tick();
      }, 70);
    };
    holdRef.current = window.setTimeout(tick, 380);
  };

  const onNudgeDown = (dir: -1 | 1) => (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    startHold(dir);
  };

  const onNudgeUp = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    stopHold();
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div className="host-layout-inspector__row host-layout-inspector__row--slider">
      <span>{name} {display}</span>
      <div className="host-layout-inspector__slider">
        <button
          type="button"
          className="btn host-layout-inspector__nudge"
          aria-label={`${name}: меньше`}
          disabled={atMin}
          onPointerDown={onNudgeDown(-1)}
          onPointerUp={onNudgeUp}
          onPointerCancel={onNudgeUp}
          onLostPointerCapture={onNudgeUp}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={name}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          className="btn host-layout-inspector__nudge"
          aria-label={`${name}: больше`}
          disabled={atMax}
          onPointerDown={onNudgeDown(1)}
          onPointerUp={onNudgeUp}
          onPointerCancel={onNudgeUp}
          onLostPointerCapture={onNudgeUp}
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function InspectorPxInput(props: {
  name: string;
  value: string;
  min: number;
  max: number;
  onCommit: (raw: string) => void;
}) {
  const { name, value, min, max, onCommit } = props;
  const valueRef = useRef(value);
  valueRef.current = value;
  const holdRef = useRef<number | null>(null);

  const stopHold = () => {
    if (holdRef.current != null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };

  useEffect(() => () => stopHold(), []);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const parsed = parsePxInput(value);
  const current = parsed ?? min;

  const nudge = (dir: -1 | 1) => {
    const from = parsePxInput(valueRef.current) ?? min;
    const next = clampSlider(from + dir, min, max);
    if (next === from) return false;
    const raw = String(next);
    valueRef.current = raw;
    onCommitRef.current(raw);
    return true;
  };

  const startHold = (dir: -1 | 1) => {
    stopHold();
    if (!nudge(dir)) return;
    const tick = () => {
      holdRef.current = window.setTimeout(() => {
        if (!nudge(dir)) {
          stopHold();
          return;
        }
        tick();
      }, 70);
    };
    holdRef.current = window.setTimeout(tick, 380);
  };

  const onNudgeDown = (dir: -1 | 1) => (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    startHold(dir);
  };

  const onNudgeUp = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    stopHold();
  };

  return (
    <div className="host-layout-inspector__px">
      <span className="host-layout-inspector__px-name">{name}</span>
      <button
        type="button"
        className="btn host-layout-inspector__nudge"
        aria-label={`${name}: меньше`}
        disabled={current <= min}
        onPointerDown={onNudgeDown(-1)}
        onPointerUp={onNudgeUp}
        onPointerCancel={onNudgeUp}
        onLostPointerCapture={onNudgeUp}
      >
        <ChevronLeft size={14} aria-hidden />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        aria-label={`${name} в пикселях`}
        value={value}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(-1);
          }
        }}
      />
      <button
        type="button"
        className="btn host-layout-inspector__nudge"
        aria-label={`${name}: больше`}
        disabled={current >= max}
        onPointerDown={onNudgeDown(1)}
        onPointerUp={onNudgeUp}
        onPointerCancel={onNudgeUp}
        onLostPointerCapture={onNudgeUp}
      >
        <ChevronRight size={14} aria-hidden />
      </button>
    </div>
  );
}

let lastInspectorPos: PanelPos | null = null;

function panelClampSize(el: HTMLElement): { width: number; height: number; minVisible: number } {
  const grip = el.querySelector('.host-layout-inspector__grip') as HTMLElement | null;
  return {
    width: el.offsetWidth,
    height: el.offsetHeight,
    minVisible: Math.max(40, Math.ceil(grip?.offsetHeight || 0) + 8),
  };
}

function objectLabel(key: string): string {
  if (key === 'prompt') return 'Вопрос';
  if (key === 'media') return 'Медиа';
  if (key === 'timer') return 'Таймер';
  if (key === 'meta') return 'Мета';
  if (key === 'explanationLabel') return 'Пояснение';
  if (key === 'explanation') return 'Текст пояснения';
  if (key === 'explanationImage') return 'Картинка пояснения';
  if (key === 'explanationVideo') return 'Видео пояснения';
  if (key === 'textHint') return 'Подсказка';
  if (key.startsWith('answer:')) return `Ответ ${shortId(key)}`;
  if (key.startsWith('matchL:')) return `Слева ${shortId(key)}`;
  if (key.startsWith('matchR:')) return `Справа ${shortId(key)}`;
  if (key.startsWith('correct:')) return key === 'correct:title' ? 'Подпись' : `Правильный ${shortId(key)}`;
  return key;
}

function shortId(key: string): string {
  const id = key.split(':')[1] || '';
  return id.slice(0, 4);
}

function readStageSize(): { width: number; height: number } | null {
  const el = document.querySelector('#stageCard .stage-center');
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  return { width: r.width, height: r.height };
}

function parsePxInput(raw: string): number | null {
  const n = Number(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 8) return null;
  return Math.round(n);
}

export function StageLayoutInspector(props: {
  selectedKey: string | null;
  box: StageBox | null;
  layout: StageLayout | null;
  applyScope: 'this' | 'all';
  onApplyScope: (scope: 'this' | 'all') => void;
  onChange: (patch: Partial<StageBox>) => void;
  onApplySizeToImages?: () => void;
}) {
  const { selectedKey, box, layout, applyScope, onApplyScope, onChange, onApplySizeToImages } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PanelPos | null>(lastInspectorPos);
  const [dragging, setDragging] = useState(false);
  const [anchorKey, setAnchorKey] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [widthStr, setWidthStr] = useState('');
  const [heightStr, setHeightStr] = useState('');

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const parent = (el.offsetParent as HTMLElement | null) || el.parentElement;
    if (!parent) return;
    const parentBox = { width: parent.clientWidth, height: parent.clientHeight };
    const panelBox = panelClampSize(el);
    const next = lastInspectorPos
      ? clampPanelPos(lastInspectorPos.left, lastInspectorPos.top, panelBox, parentBox, 8, panelBox.minVisible)
      : clampPanelPos(8, parentBox.height - panelBox.height - 8, panelBox, parentBox, 8, panelBox.minVisible);
    lastInspectorPos = next;
    setPos(next);
  }, [selectedKey, box]);

  useEffect(() => {
    setAnchorKey('');
  }, [selectedKey]);

  const stageSize = readStageSize();
  const px = box && stageSize ? boxSizePx(box, stageSize) : null;

  useEffect(() => {
    if (!px) {
      setWidthStr('');
      setHeightStr('');
      return;
    }
    setWidthStr(String(px.w));
    setHeightStr(String(px.h));
  }, [selectedKey, px?.w, px?.h]);

  const commitSize = (nextW: string, nextH: string) => {
    if (!box || !stageSize) return;
    const widthPx = parsePxInput(nextW);
    const heightPx = parsePxInput(nextH);
    if (widthPx == null || heightPx == null) return;
    const sized = setBoxSizePx(box, widthPx, heightPx, stageSize);
    // Только геометрия — иначе fontSize в patch включает auto-fit и размер снова растёт.
    onChange({ x: sized.x, y: sized.y, w: sized.w, h: sized.h });
  };

  const onWidthCommit = (raw: string) => {
    if (!px) return;
    let w = raw;
    let h = heightStr;
    if (lockAspect && px.h > 0) {
      const parsed = parsePxInput(raw);
      if (parsed != null) {
        h = String(Math.max(8, Math.round(parsed / (px.w / px.h))));
        setHeightStr(h);
      }
    }
    setWidthStr(w);
    commitSize(w, h);
  };

  const onHeightCommit = (raw: string) => {
    if (!px) return;
    let h = raw;
    let w = widthStr;
    if (lockAspect && px.w > 0) {
      const parsed = parsePxInput(raw);
      if (parsed != null) {
        w = String(Math.max(8, Math.round(parsed * (px.w / px.h))));
        setWidthStr(w);
      }
    }
    setHeightStr(h);
    commitSize(w, h);
  };

  const imageKeys = (() => {
    const el = document.querySelector('#stageCard .stage-center');
    return el instanceof HTMLElement ? imageSlotKeysFromStage(el) : [];
  })();
  const canApplyToImages = !!(
    selectedKey &&
    onApplySizeToImages &&
    imageKeys.includes(selectedKey) &&
    imageKeys.some((k) => k !== selectedKey)
  );

  const others: { key: string; box: StageBox }[] = [];
  if (layout) {
    eachStageBox(layout, (k, b) => {
      if (k !== selectedKey) others.push({ key: k, box: b });
    });
  }
  const anchor = others.find((o) => o.key === anchorKey)?.box || others[0]?.box || null;

  const snapTo = (mode: BoxAnchor) => {
    if (!box || !anchor) return;
    onChange(alignBoxToBox(box, anchor, mode));
  };

  const bold = box?.fontWeight === 700;
  const fontSize = box?.fontSize ?? 24;
  const opacity = box?.bgOpacity ?? 1;
  const strokeWidth = box?.strokeWidth ?? 0;

  const onGripPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('button, input, label, select')) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = panelRef.current;
    const parent = (el?.offsetParent as HTMLElement | null) || el?.parentElement;
    if (!el || !parent) return;
    const start = pos || { left: el.offsetLeft, top: el.offsetTop };
    const startX = ev.clientX;
    const startY = ev.clientY;
    const panelBox = panelClampSize(el);
    setDragging(true);
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const onMove = (e: PointerEvent) => {
      const next = clampPanelPos(
        start.left + e.clientX - startX,
        start.top + e.clientY - startY,
        panelBox,
        { width: parent.clientWidth, height: parent.clientHeight },
        8,
        panelBox.minVisible,
      );
      lastInspectorPos = next;
      setPos(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={panelRef}
      className={`host-layout-inspector${dragging ? ' is-dragging' : ''}`}
      role="region"
      aria-label="Стили объекта"
      style={pos ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={(e) => {
        e.stopPropagation();
        onGripPointerDown(e);
      }}
    >
      <div
        className="host-layout-inspector__grip"
        onPointerDown={onGripPointerDown}
      >
        <GripHorizontal size={16} aria-hidden />
        <span className="host-layout-inspector__title">
          {selectedKey && box ? objectLabel(selectedKey) : 'Раскладка'}
        </span>
      </div>
      <div className="host-layout-inspector__row host-layout-inspector__row--wrap">
        <span>Применить</span>
        <div className="host-layout-inspector__btns">
          <button
            type="button"
            className={`btn host-layout-inspector__chip${applyScope === 'this' ? ' is-on' : ''}`}
            aria-pressed={applyScope === 'this'}
            onClick={() => onApplyScope('this')}
          >
            Этот экран
          </button>
          <button
            type="button"
            className={`btn host-layout-inspector__chip${applyScope === 'all' ? ' is-on' : ''}`}
            aria-pressed={applyScope === 'all'}
            onClick={() => onApplyScope('all')}
          >
            Все экраны
          </button>
        </div>
      </div>
      {selectedKey && box ? (
        <>
      {px ? (
        <div className="host-layout-inspector__row host-layout-inspector__row--wrap host-layout-inspector__size">
          <span>Размер</span>
          <InspectorPxInput
            name="Ш"
            value={widthStr}
            min={8}
            max={stageSize ? Math.max(8, Math.round(stageSize.width)) : 4000}
            onCommit={onWidthCommit}
          />
          <span className="host-layout-inspector__times" aria-hidden>
            ×
          </span>
          <InspectorPxInput
            name="В"
            value={heightStr}
            min={8}
            max={stageSize ? Math.max(8, Math.round(stageSize.height)) : 4000}
            onCommit={onHeightCommit}
          />
          <span className="host-layout-inspector__px-unit">px</span>
          <button
            type="button"
            className={`btn host-layout-inspector__icon${lockAspect ? ' is-on' : ''}`}
            aria-pressed={lockAspect}
            aria-label={lockAspect ? 'Пропорции зафиксированы' : 'Пропорции свободные'}
            title={lockAspect ? 'Пропорции зафиксированы' : 'Пропорции свободные'}
            onClick={() => setLockAspect((v) => !v)}
          >
            {lockAspect ? <Link2 size={16} aria-hidden /> : <Link2Off size={16} aria-hidden />}
          </button>
          {canApplyToImages ? (
            <button
              type="button"
              className="btn host-layout-inspector__chip"
              onClick={onApplySizeToImages}
            >
              Всем картинкам
            </button>
          ) : null}
        </div>
      ) : null}
      <InspectorSlider
        name="Размер"
        display={`${fontSize}px`}
        value={fontSize}
        min={10}
        max={96}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <label className="host-layout-inspector__row host-layout-inspector__row--wrap">
        <span>Шрифт</span>
        <StageFontSelect
          className="host-layout-inspector__select"
          value={box.fontFamily}
          onChange={(fontFamily) => (fontFamily ? onChange({ fontFamily }) : onChange({ fontFamily: undefined }))}
        />
      </label>
      <button
        type="button"
        className={`btn host-layout-inspector__bold${bold ? ' is-on' : ''}`}
        aria-pressed={bold}
        onClick={() => onChange({ fontWeight: bold ? 400 : 700 })}
      >
        <Bold size={16} aria-hidden />
        Жирный
      </button>
      <div className="host-layout-inspector__row">
        <span>Текст</span>
        <div className="host-layout-inspector__btns">
          {(
            [
              ['left', AlignLeft, 'Слева'],
              ['center', AlignCenter, 'По центру'],
              ['right', AlignRight, 'Справа'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              className={`btn host-layout-inspector__icon${(box.align || 'center') === v ? ' is-on' : ''}`}
              aria-label={label}
              aria-pressed={(box.align || 'center') === v}
              onClick={() => onChange({ align: v })}
            >
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="host-layout-inspector__row">
        <span>По вертикали</span>
        <div className="host-layout-inspector__btns">
          {(
            [
              ['top', AlignVerticalJustifyStart, 'Сверху'],
              ['middle', AlignVerticalJustifyCenter, 'Посередине'],
              ['bottom', AlignVerticalJustifyEnd, 'Снизу'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              className={`btn host-layout-inspector__icon${(box.valign || 'middle') === v ? ' is-on' : ''}`}
              aria-label={label}
              aria-pressed={(box.valign || 'middle') === v}
              onClick={() => onChange({ valign: v })}
            >
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="host-layout-inspector__row host-layout-inspector__row--wrap">
        <span>Лист</span>
        <div className="host-layout-inspector__btns">
          <button type="button" className="btn host-layout-inspector__icon" aria-label="Центр по горизонтали" onClick={() => onChange(centerBoxOnStage(box, 'x'))}>
            ↔
          </button>
          <button type="button" className="btn host-layout-inspector__icon" aria-label="Центр по вертикали" onClick={() => onChange(centerBoxOnStage(box, 'y'))}>
            ↕
          </button>
          <button type="button" className="btn host-layout-inspector__chip" onClick={() => onChange(centerBoxOnStage(box, 'both'))}>
            Центр
          </button>
          <button type="button" className="btn host-layout-inspector__chip" onClick={() => onChange(alignBoxToStage(box, 'left'))}>
            Край Л
          </button>
          <button type="button" className="btn host-layout-inspector__chip" onClick={() => onChange(alignBoxToStage(box, 'right'))}>
            Край П
          </button>
          <button type="button" className="btn host-layout-inspector__chip" onClick={() => onChange(alignBoxToStage(box, 'top'))}>
            Край В
          </button>
          <button type="button" className="btn host-layout-inspector__chip" onClick={() => onChange(alignBoxToStage(box, 'bottom'))}>
            Край Н
          </button>
        </div>
      </div>
      {others.length ? (
        <div className="host-layout-inspector__row host-layout-inspector__row--wrap">
          <span>К объекту</span>
          <select
            className="host-layout-inspector__select"
            value={anchorKey || others[0].key}
            onChange={(e) => setAnchorKey(e.target.value)}
            aria-label="Объект для привязки"
          >
            {others.map((o) => (
              <option key={o.key} value={o.key}>
                {objectLabel(o.key)}
              </option>
            ))}
          </select>
          <div className="host-layout-inspector__btns">
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('left')}>
              Л
            </button>
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('centerX')}>
              ⌖X
            </button>
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('right')}>
              П
            </button>
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('top')}>
              В
            </button>
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('centerY')}>
              ⌖Y
            </button>
            <button type="button" className="btn host-layout-inspector__chip" onClick={() => snapTo('bottom')}>
              Н
            </button>
          </div>
        </div>
      ) : null}
      <label className="host-layout-inspector__row">
        <span>Цвет</span>
        <input
          type="color"
          value={box.color || '#f1f5f9'}
          onChange={(e) => onChange({ color: e.target.value })}
        />
      </label>
      <label className="host-layout-inspector__row">
        <span>Обводка</span>
        <input
          type="color"
          value={box.strokeColor || '#ffffff'}
          onChange={(e) =>
            onChange({
              strokeColor: e.target.value,
              strokeWidth: box.strokeWidth && box.strokeWidth > 0 ? box.strokeWidth : 2,
            })
          }
        />
      </label>
      <InspectorSlider
        name="Толщина"
        display={`${strokeWidth}px`}
        value={strokeWidth}
        min={0}
        max={8}
        onChange={(w) => {
          if (w <= 0) onChange({ strokeWidth: 0, strokeColor: undefined });
          else onChange({ strokeWidth: w, strokeColor: box.strokeColor || '#ffffff' });
        }}
      />
      <label className="host-layout-inspector__row">
        <span>Фон</span>
        <input
          type="color"
          value={box.bg || '#ffffff'}
          onChange={(e) =>
            onChange({
              bg: e.target.value,
              bgOpacity: box.bgOpacity == null ? 1 : box.bgOpacity,
            })
          }
        />
      </label>
      <InspectorSlider
        name="Прозрачность"
        display={`${Math.round(opacity * 100)}%`}
        value={opacity}
        min={0}
        max={1}
        step={0.05}
        onChange={(bgOpacity) => onChange({ bg: box.bg || '#ffffff', bgOpacity })}
      />
        </>
      ) : null}
    </div>
  );
}
