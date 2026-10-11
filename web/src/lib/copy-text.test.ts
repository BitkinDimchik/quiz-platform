/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './copy-text';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses the clipboard API in a secure context when no field is given', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('  http://192.168.0.155:3000/player?code=AB12  ')).resolves.toBe(
      true,
    );
    expect(writeText).toHaveBeenCalledWith('http://192.168.0.155:3000/player?code=AB12');
  });

  it('copies from a visible input on insecure HTTP LAN', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const exec = vi.fn().mockReturnValue(true);
    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    document.execCommand = exec as typeof document.execCommand;
    const input = document.createElement('input');
    input.value = 'http://192.168.0.155:3000/player?code=AB12';
    document.body.appendChild(input);

    await expect(copyTextToClipboard(input.value, input)).resolves.toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const exec = vi.fn().mockReturnValue(true);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    document.execCommand = exec as typeof document.execCommand;

    await expect(copyTextToClipboard('https://quiz.example/player?code=ZZ')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('returns false for empty text', async () => {
    await expect(copyTextToClipboard('   ')).resolves.toBe(false);
  });
});
