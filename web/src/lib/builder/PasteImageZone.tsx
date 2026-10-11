import { useCallback, useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type ReactNode } from 'react';
import { toast } from '../toast';
import { getImageFileFromClipboard, readImageFileFromClipboard } from './clipboard-image';
import { readImageFileFromServerClipboard } from './os-clipboard';

type Props = {
  children: ReactNode;
  className?: string;
  onImageFile: (file: File) => void | Promise<void>;
  disabled?: boolean;
  /** Кнопка «Вставить из буфера» */
  showPasteButton?: boolean;
  /** Подсказка про Ctrl+V */
  showHint?: boolean;
};

function pasteErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') {
      return 'Нет доступа к буферу — нажмите Ctrl+V';
    }
    if (err.name === 'SecurityError' || err.name === 'NotSupportedError') {
      return 'Буфер недоступен на этом адресе — нажмите Ctrl+V';
    }
    if (err.name === 'NotFoundError') {
      return 'В буфере нет изображения — скопируйте картинку и нажмите Ctrl+V';
    }
  }
  return err instanceof Error ? err.message : 'Не удалось вставить изображение';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function firstFile(promises: Promise<File | null>[]): Promise<File | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (!pending) {
      resolve(null);
      return;
    }
    for (const p of promises) {
      p.then(
        (file) => {
          if (file) resolve(file);
          else if (--pending === 0) resolve(null);
        },
        () => {
          if (--pending === 0) resolve(null);
        },
      );
    }
  });
}

export function PasteImageZone({
  children,
  className,
  onImageFile,
  disabled,
  showPasteButton = true,
  showHint = false,
}: Props) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const disarmRef = useRef<(() => void) | null>(null);
  const [awaitingPaste, setAwaitingPaste] = useState(false);

  const applyFile = useCallback(
    async (file: File) => {
      try {
        await onImageFile(file);
      } catch (err) {
        toast(pasteErrorMessage(err));
      }
    },
    [onImageFile],
  );

  const disarmPaste = useCallback(() => {
    disarmRef.current?.();
    disarmRef.current = null;
    setAwaitingPaste(false);
  }, []);

  useEffect(() => () => disarmPaste(), [disarmPaste]);

  const pasteFromClipboard = useCallback(async () => {
    if (disabled) return;
    let done = false;
    const take = async (file: File) => {
      if (done) return;
      done = true;
      disarmPaste();
      await applyFile(file);
    };
    const onWinPaste = (e: Event) => {
      const file = getImageFileFromClipboard(e as ClipboardEvent);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      void take(file);
    };
    disarmPaste();
    window.addEventListener('paste', onWinPaste, true);
    const timeout = window.setTimeout(() => disarmPaste(), 20000);
    disarmRef.current = () => {
      window.removeEventListener('paste', onWinPaste, true);
      window.clearTimeout(timeout);
      disarmRef.current = null;
    };
    setAwaitingPaste(true);
    zoneRef.current?.focus();

    const canRead =
      typeof navigator !== 'undefined' && !!navigator.clipboard?.read && window.isSecureContext;
    const reads: Promise<File | null>[] = [readImageFileFromServerClipboard()];
    if (canRead) {
      reads.push(withTimeout(readImageFileFromClipboard().catch(() => null), 4000));
    }

    try {
      const file = await firstFile(reads);
      if (file) {
        await take(file);
        return;
      }
    } catch (err) {
      toast(pasteErrorMessage(err));
      return;
    }
    if (!done) toast('Нажмите Ctrl+V, чтобы вставить картинку');
  }, [applyFile, disabled, disarmPaste]);

  const onPaste = useCallback(
    async (e: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const file = getImageFileFromClipboard(e.nativeEvent);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      disarmPaste();
      await applyFile(file);
    },
    [applyFile, disabled, disarmPaste],
  );

  return (
    <div
      ref={zoneRef}
      className={['paste-image-zone', awaitingPaste ? 'paste-image-zone--awaiting' : '', className]
        .filter(Boolean)
        .join(' ')}
      tabIndex={disabled ? undefined : 0}
      role="group"
      aria-label="Зона вставки изображения из буфера обмена"
      onPaste={disabled ? undefined : onPaste}
    >
      {children}
      {showPasteButton && !disabled ? (
        <button type="button" className="btn paste-image-zone__btn" onClick={() => void pasteFromClipboard()}>
          {awaitingPaste ? 'Ctrl+V…' : 'Вставить из буфера'}
        </button>
      ) : null}
      {awaitingPaste ? (
        <span className="muted paste-image-zone__hint">Нажмите Ctrl+V, если картинка не вставилась</span>
      ) : showHint && !disabled ? (
        <span className="muted paste-image-zone__hint">или Ctrl+V, когда зона в фокусе</span>
      ) : null}
    </div>
  );
}
