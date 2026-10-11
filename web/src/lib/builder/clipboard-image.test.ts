import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clipboardEventHasImageFile,
  getImageFileFromClipboard,
  readImageFileFromClipboard,
} from './clipboard-image';

function mockClipboardEvent(
  items: Array<{ kind: string; type: string; file?: File | null }>,
  files: File[] = [],
): ClipboardEvent {
  return {
    clipboardData: {
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file ?? null,
      })),
      files,
    },
  } as unknown as ClipboardEvent;
}

describe('clipboard-image', () => {
  it('returns image file from clipboard items', () => {
    const png = new File(['x'], 'shot.png', { type: 'image/png' });
    const event = mockClipboardEvent([{ kind: 'file', type: 'image/png', file: png }]);
    expect(getImageFileFromClipboard(event)).toBe(png);
    expect(clipboardEventHasImageFile(event)).toBe(true);
  });

  it('ignores non-image clipboard items', () => {
    const event = mockClipboardEvent([{ kind: 'string', type: 'text/plain', file: null }]);
    expect(getImageFileFromClipboard(event)).toBeNull();
    expect(clipboardEventHasImageFile(event)).toBe(false);
  });

  it('falls back to clipboard files list', () => {
    const jpg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const event = mockClipboardEvent([], [jpg]);
    expect(getImageFileFromClipboard(event)).toBe(jpg);
  });

  it('accepts a file with empty mime but an image name', () => {
    const png = new File(['x'], 'shot.png', { type: '' });
    const event = mockClipboardEvent([{ kind: 'file', type: '', file: png }]);
    expect(getImageFileFromClipboard(event)).toBe(png);
  });

  it('reads a data-url image from clipboard HTML', () => {
    const dataUrl = 'data:image/png;base64,AQID';
    const event = {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) => (type === 'text/html' ? `<img src="${dataUrl}">` : ''),
      },
    } as unknown as ClipboardEvent;
    const file = getImageFileFromClipboard(event);
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('clipboard.png');
  });

  it('reads a data-url from clipboard plain text', () => {
    const dataUrl = 'data:image/png;base64,AQID';
    const event = {
      clipboardData: {
        items: [],
        files: [],
        getData: (type: string) => (type === 'text/plain' ? dataUrl : ''),
      },
    } as unknown as ClipboardEvent;
    const file = getImageFileFromClipboard(event);
    expect(file?.type).toBe('image/png');
  });

  it('reads image via Clipboard API', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => [
          {
            types: ['image/png'],
            getType: vi.fn(async () => blob),
          },
        ]),
      },
    });
    const file = await readImageFileFromClipboard();
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('clipboard.png');
  });

  it('probes image/png when the item only lists HTML', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn(async () => [
          {
            types: ['text/html'],
            getType: vi.fn(async (type: string) => {
              if (type === 'image/png') return blob;
              throw new Error('no');
            }),
          },
        ]),
      },
    });
    const file = await readImageFileFromClipboard();
    expect(file?.type).toBe('image/png');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
