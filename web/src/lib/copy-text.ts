function copyViaExecCommand(): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  try {
    return !!document.execCommand('copy');
  } catch {
    return false;
  }
}

function selectField(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.focus();
  el.select();
  const len = el.value.length;
  try {
    el.setSelectionRange(0, len);
  } catch {
    /* number/email inputs may throw */
  }
}

function copyFromField(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  selectField(el);
  return copyViaExecCommand();
}

function copyFromTempTextarea(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  selectField(ta);
  const ok = copyViaExecCommand();
  ta.remove();
  return ok;
}

function canUseClipboardApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

/**
 * Copy text. Clipboard API only on HTTPS/localhost; on http://192.168.x.x
 * uses execCommand from the visible field or a temporary textarea.
 */
export async function copyTextToClipboard(
  text: string,
  source?: HTMLInputElement | HTMLTextAreaElement | null,
): Promise<boolean> {
  const value = String(text ?? '').trim();
  if (!value) return false;
  if (source && String(source.value || '').trim() === value && copyFromField(source)) return true;
  if (canUseClipboardApi()) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* insecure LAN, permission denied */
    }
  }
  if (source && String(source.value || '').trim() === value && copyFromField(source)) return true;
  return copyFromTempTextarea(value);
}
