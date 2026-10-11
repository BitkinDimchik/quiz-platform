import { useState } from 'react';

type NumericSpinnerInputProps = {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  fallback?: number;
  onChange: (value: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseDigits(raw: string) {
  return raw.replace(/[^\d]/g, '');
}

/** Числовое поле: можно полностью очистить при вводе; стрелки ± по бокам. */
export function NumericSpinnerInput({
  id,
  value,
  min = 1,
  max = 999,
  step = 1,
  fallback,
  onChange,
}: NumericSpinnerInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const resolvedFallback = fallback ?? value;

  const display = editing ? draft : String(value);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange(resolvedFallback);
      setDraft(null);
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
    setDraft(null);
  };

  const bump = (delta: number) => {
    const base = editing ? parseInt(draft || '', 10) : value;
    const next = (Number.isFinite(base) ? base : resolvedFallback) + delta;
    onChange(clamp(next, min, max));
    setDraft(null);
  };

  return (
    <div className="numeric-spinner">
      <input
        id={id}
        inputMode="numeric"
        value={display}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(parseDigits(e.target.value))}
        onBlur={() => commit(draft ?? String(value))}
      />
      <div className="numeric-spinner__btns" aria-hidden="true">
        <button type="button" tabIndex={-1} aria-label="Увеличить" onClick={() => bump(step)}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label="Уменьшить" onClick={() => bump(-step)}>
          ▼
        </button>
      </div>
    </div>
  );
}

type InheritNumericSpinnerInputProps = {
  id?: string;
  inherit: boolean;
  inheritPlaceholder: string;
  inheritValue: number;
  customValue: number;
  min?: number;
  max?: number;
  step?: number;
  onInherit: () => void;
  onCustom: (value: number) => void;
};

/**
 * Поле времени вопроса: по умолчанию placeholder «из настроек раунда»;
 * при вводе — своё значение; полная очистка и blur возвращает наследование.
 */
export function InheritNumericSpinnerInput({
  id,
  inherit,
  inheritPlaceholder,
  inheritValue,
  customValue,
  min = 1,
  max = 999,
  step = 1,
  onInherit,
  onCustom,
}: InheritNumericSpinnerInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const display = editing ? draft : inherit ? '' : String(customValue);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      onInherit();
      setDraft(null);
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isFinite(n)) onCustom(clamp(n, min, max));
    else if (inherit) onInherit();
    setDraft(null);
  };

  const bump = (delta: number) => {
    const base = inherit
      ? inheritValue
      : editing
        ? parseInt(draft || '', 10)
        : customValue;
    const next = (Number.isFinite(base) ? base : inheritValue) + delta;
    onCustom(clamp(next, min, max));
    setDraft(null);
  };

  return (
    <div className={`numeric-spinner${inherit ? ' numeric-spinner--inherit' : ''}`}>
      <input
        id={id}
        inputMode="numeric"
        placeholder={inheritPlaceholder}
        value={display}
        onFocus={() => setDraft(inherit ? '' : String(customValue))}
        onChange={(e) => {
          const next = parseDigits(e.target.value);
          setDraft(next);
          if (next !== '') {
            const n = parseInt(next, 10);
            if (Number.isFinite(n)) onCustom(clamp(n, min, max));
          }
        }}
        onBlur={() => commit(draft ?? (inherit ? '' : String(customValue)))}
      />
      <div className="numeric-spinner__btns" aria-hidden="true">
        <button type="button" tabIndex={-1} aria-label="Увеличить" onClick={() => bump(step)}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label="Уменьшить" onClick={() => bump(-step)}>
          ▼
        </button>
      </div>
    </div>
  );
}
