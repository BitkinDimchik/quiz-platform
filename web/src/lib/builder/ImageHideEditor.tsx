import { useCallback, useRef, useState } from 'react';
import type { ImageHideRect } from '../host/image-hide-rect';
import {
  DEFAULT_IMAGE_HIDE_RECT,
  MAX_IMAGE_HIDE_RECTS,
  nextImageHideRect,
  parseImageHideRect,
  parseImageHideRects,
} from '../host/image-hide-rect';

type Props = {
  src: string;
  value: ImageHideRect | ImageHideRect[] | null | undefined;
  onChange: (next: ImageHideRect[]) => void;
};

type DragMode = 'move' | 'resize';

function clientPct(el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  return {
    x: ((clientX - r.left) / w) * 100,
    y: ((clientY - r.top) / h) * 100,
  };
}

export function ImageHideEditor({ src, value, onChange }: Props) {
  const boxes = parseImageHideRects(value) || [DEFAULT_IMAGE_HIDE_RECT];
  const [selected, setSelected] = useState(0);
  const sel = Math.max(0, Math.min(selected, boxes.length - 1));
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    index: number;
    startX: number;
    startY: number;
    orig: ImageHideRect;
  } | null>(null);

  const commitAt = useCallback(
    (index: number, nextBox: ImageHideRect) => {
      const parsed = parseImageHideRect(nextBox);
      if (!parsed) return;
      const next = boxes.map((b, i) => (i === index ? parsed : b));
      onChange(next);
    },
    [boxes, onChange],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const frame = frameRef.current;
      if (!drag || !frame) return;
      const p = clientPct(frame, e.clientX, e.clientY);
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      if (drag.mode === 'move') {
        commitAt(drag.index, {
          ...drag.orig,
          x: drag.orig.x + dx,
          y: drag.orig.y + dy,
        });
      } else {
        commitAt(drag.index, {
          ...drag.orig,
          w: drag.orig.w + dx,
          h: drag.orig.h + dy,
        });
      }
    },
    [commitAt],
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
  }, [onPointerMove]);

  const startDrag = (index: number, mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    const box = boxes[index];
    if (!frame || !box) return;
    setSelected(index);
    const p = clientPct(frame, e.clientX, e.clientY);
    dragRef.current = { mode, index, startX: p.x, startY: p.y, orig: { ...box } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
  };

  const addRect = () => {
    if (boxes.length >= MAX_IMAGE_HIDE_RECTS) return;
    const next = [...boxes, nextImageHideRect(boxes)];
    onChange(next);
    setSelected(next.length - 1);
  };

  const removeSelected = () => {
    if (boxes.length <= 1) return;
    const next = boxes.filter((_, i) => i !== sel);
    onChange(next);
    setSelected(Math.max(0, sel - 1));
  };

  return (
    <div className="image-hide-editor">
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Перетащите чёрные прямоугольники. Угол справа снизу меняет размер. Плашки видны только
        ведущему; при раскрытии ответа пропадают.
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={boxes.length >= MAX_IMAGE_HIDE_RECTS}
          onClick={addRect}
        >
          Добавить плашку
        </button>
        <button className="btn" type="button" disabled={boxes.length <= 1} onClick={removeSelected}>
          Удалить выбранную
        </button>
        <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
          {boxes.length} из {MAX_IMAGE_HIDE_RECTS}
        </span>
      </div>
      <div className="image-hide-editor__frame" ref={frameRef}>
        <img src={src} alt="" draggable={false} />
        {boxes.map((box, index) => (
          <div
            key={index}
            className={
              'image-hide-editor__rect' + (index === sel ? ' image-hide-editor__rect--selected' : '')
            }
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            onPointerDown={(e) => startDrag(index, 'move', e)}
          >
            {index === sel ? (
              <button
                type="button"
                className="image-hide-editor__handle"
                aria-label="Изменить размер плашки"
                onPointerDown={(e) => startDrag(index, 'resize', e)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
