import { useMemo } from 'react';
import {
  formatFontFamilyCss,
  mergeFontFamilyOptions,
  parsePrimaryFontFamily,
} from '../lib/host/stage-fonts';
import { useInstalledFontFamilies } from '../lib/host/useInstalledFontFamilies';

type Props = {
  id?: string;
  value?: string | null;
  onChange: (fontFamily: string | undefined) => void;
  className?: string;
};

export function StageFontSelect({ id, value, onChange, className }: Props) {
  const families = useInstalledFontFamilies();
  const options = useMemo(() => mergeFontFamilyOptions(families, value), [families, value]);
  const currentFamily = parsePrimaryFontFamily(value) || '';

  return (
    <div className="stage-font-select">
      <select
        id={id}
        className={className}
        value={currentFamily}
        onChange={(e) => {
          const family = e.target.value;
          onChange(family ? formatFontFamilyCss(family) : undefined);
        }}
        aria-label="Шрифт текста"
      >
        <option value="">По умолчанию</option>
        {options.map((family) => (
          <option key={family} value={family} style={{ fontFamily: formatFontFamilyCss(family) }}>
            {family}
          </option>
        ))}
      </select>
    </div>
  );
}
