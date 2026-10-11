import { useEffect, useState } from 'react';
import {
  DEFAULT_BETTING_SEC,
  MAX_BETTING_PRESETS,
  MAX_BETTING_SEC,
  bettingModeOf,
  formatStakePresetsText,
  normalizeStakePresets,
  parseBettingSec,
  parseStakeLimit,
  parseStakePresetsText,
  type BettingSettingsValue,
} from '../lib/builder/betting-settings';
import type { BettingMode } from '../lib/builder/types';

type Props = {
  idPrefix: string;
  value: BettingSettingsValue;
  /** Мутирует настройки ставки в драфте. */
  onChange: (mutate: (target: BettingSettingsValue) => void) => void;
};

/**
 * Настройки размера ставки: свободный ввод в заданных пределах
 * или выбор из заложенных вариантов.
 */
export function BettingSettings({ idPrefix, value, onChange }: Props) {
  const mode = bettingModeOf(value);
  const [presetsText, setPresetsText] = useState(() => formatStakePresetsText(value.bettingPresets));

  // Внешняя смена вопроса/раунда должна переписать поле вариантов.
  useEffect(() => {
    setPresetsText(formatStakePresetsText(value.bettingPresets));
  }, [idPrefix]);

  const presets = normalizeStakePresets(value.bettingPresets);

  return (
    <>
      <div style={{ marginTop: 8 }}>
        <label htmlFor={`${idPrefix}BettingMode`}>Как игрок задаёт ставку</label>
        <select
          id={`${idPrefix}BettingMode`}
          value={mode}
          onChange={(e) => {
            const next = e.target.value === 'presets' ? 'presets' : ('free' as BettingMode);
            onChange((t) => {
              t.bettingMode = next;
            });
          }}
        >
          <option value="free">Свободный ввод суммы</option>
          <option value="presets">Выбор из готовых вариантов</option>
        </select>
      </div>

      {mode === 'free' ? (
        <div className="row" style={{ gap: 12, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${idPrefix}BettingMinStake`}>Мин. ставка (очки)</label>
            <input
              id={`${idPrefix}BettingMinStake`}
              type="number"
              min={1}
              step={1}
              placeholder="1"
              value={value.bettingMinStake ?? ''}
              onChange={(e) => {
                const v = parseStakeLimit(e.target.value);
                onChange((t) => {
                  t.bettingMinStake = v;
                });
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${idPrefix}BettingMaxStake`}>Макс. ставка (очки)</label>
            <input
              id={`${idPrefix}BettingMaxStake`}
              type="number"
              min={1}
              step={1}
              placeholder="весь счёт"
              value={value.bettingMaxStake ?? ''}
              onChange={(e) => {
                const v = parseStakeLimit(e.target.value);
                onChange((t) => {
                  t.bettingMaxStake = v;
                });
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <label htmlFor={`${idPrefix}BettingPresets`}>Варианты ставок (очки, через запятую)</label>
          <input
            id={`${idPrefix}BettingPresets`}
            type="text"
            inputMode="numeric"
            placeholder="10, 25, 50"
            value={presetsText}
            onChange={(e) => {
              setPresetsText(e.target.value);
              const parsed = parseStakePresetsText(e.target.value);
              onChange((t) => {
                t.bettingPresets = parsed;
              });
            }}
            onBlur={() => setPresetsText(formatStakePresetsText(value.bettingPresets))}
          />
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {presets.length
              ? `Игрок выберет один из вариантов: ${presets.join(', ')}.`
              : `Укажите до ${MAX_BETTING_PRESETS} значений. Без вариантов останется свободный ввод.`}
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <label htmlFor={`${idPrefix}BettingSec`}>Время на ставку (сек)</label>
        <input
          id={`${idPrefix}BettingSec`}
          type="number"
          min={3}
          max={MAX_BETTING_SEC}
          step={1}
          placeholder={`${DEFAULT_BETTING_SEC} — по умолчанию`}
          value={value.bettingSec ?? ''}
          onChange={(e) => {
            const v = parseBettingSec(e.target.value);
            onChange((t) => {
              t.bettingSec = v;
            });
          }}
        />
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Столько держится экран ставки. Если время экрана раунда или прочтения вопроса больше, берётся оно.
        </div>
      </div>

      <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        Ставка не обязательна: без неё вопрос идёт по стандартной цене и очки не теряются.
      </div>
    </>
  );
}
