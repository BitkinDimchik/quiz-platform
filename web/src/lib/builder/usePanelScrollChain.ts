import { useEffect } from 'react';

/**
 * На шагах 2/3: когда прокрутка внутри панели дошла до верха (или низа),
 * колёсико/тачпад продолжает прокручивать страницу — wizard уезжает вверх.
 */
export function usePanelScrollChain(step: number) {
  useEffect(() => {
    if (step !== 3 && step !== 4) return;

    const onWheel = (e: WheelEvent) => {
      const scrollEl = (e.target as Element | null)?.closest(
        '#step2 .builder-panel-scroll, #step3 .builder-panel-scroll',
      ) as HTMLElement | null;
      if (!scrollEl) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const hasOverflow = scrollHeight - clientHeight > 1;

      if (!hasOverflow) {
        window.scrollBy({ top: e.deltaY, left: 0 });
        return;
      }

      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if (e.deltaY < 0 && atTop) {
        window.scrollBy({ top: e.deltaY, left: 0 });
      } else if (e.deltaY > 0 && atBottom) {
        window.scrollBy({ top: e.deltaY, left: 0 });
      }
    };

    document.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, [step]);
}
