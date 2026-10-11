import { useEffect, useState } from 'react';
import { getFallbackFontFamilies, loadInstalledFontFamilies } from './local-fonts';

export function useInstalledFontFamilies(): string[] {
  const [families, setFamilies] = useState(getFallbackFontFamilies);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { families: list } = await loadInstalledFontFamilies();
      if (!cancelled && list.length) setFamilies(list);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return families;
}
