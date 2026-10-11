const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp'];

function isImageMime(type: string | undefined): boolean {
  return !!type && type.toLowerCase().startsWith('image/');
}

function isImageFileName(name: string | undefined): boolean {
  return !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function blobToImageFile(blob: Blob, type: string): File {
  const mime = type || blob.type || 'image/png';
  const ext = mime.split('/')[1]?.replace(/[^a-z0-9+-]/gi, '') || 'png';
  return new File([blob], `clipboard.${ext}`, { type: mime });
}

export function imageFileFromDataUrl(dataUrl: string): File | null {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([a-zA-Z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const bin = atob(m[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return blobToImageFile(new Blob([bytes], { type: mime }), mime);
}

export function imageFileFromClipboardHtml(html: string): File | null {
  if (!html) return null;
  const match = /data:image\/[a-zA-Z0-9+.-]+;base64,[a-zA-Z0-9+/=\s]+/i.exec(html);
  return match ? imageFileFromDataUrl(match[0]) : null;
}

/** Извлекает файл изображения из события paste (Ctrl+V / буфер обмена). */
export function getImageFileFromClipboard(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;

  const items = data.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file && (isImageMime(item.type) || isImageMime(file.type) || isImageFileName(file.name))) {
        return file;
      }
    }
  }

  const files = data.files;
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isImageMime(file.type) || isImageFileName(file.name)) return file;
    }
  }

  try {
    const html = data.getData?.('text/html') || '';
    const fromHtml = imageFileFromClipboardHtml(html);
    if (fromHtml) return fromHtml;
  } catch {
    /* ignore */
  }
  try {
    const text = data.getData?.('text/plain') || '';
    const fromText = imageFileFromDataUrl(text.trim());
    if (fromText) return fromText;
  } catch {
    /* ignore */
  }
  return null;
}

export function clipboardEventHasImageFile(event: ClipboardEvent): boolean {
  return getImageFileFromClipboard(event) != null;
}

async function fileFromClipboardItem(item: ClipboardItem): Promise<File | null> {
  const types = [...item.types];
  for (const type of types) {
    if (!isImageMime(type)) continue;
    try {
      const blob = await item.getType(type);
      if (blob && blob.size > 0) return blobToImageFile(blob, type);
    } catch {
      /* type listed but unreadable */
    }
  }
  for (const type of IMAGE_TYPES) {
    if (types.includes(type)) continue;
    try {
      const blob = await item.getType(type);
      if (blob && blob.size > 0) return blobToImageFile(blob, blob.type || type);
    } catch {
      /* browser has no such representation */
    }
  }
  if (types.includes('text/html')) {
    try {
      const html = await (await item.getType('text/html')).text();
      const fromHtml = imageFileFromClipboardHtml(html);
      if (fromHtml) return fromHtml;
    } catch {
      /* ignore */
    }
  }
  if (types.includes('text/plain')) {
    try {
      const text = await (await item.getType('text/plain')).text();
      const fromText = imageFileFromDataUrl(text.trim());
      if (fromText) return fromText;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Читает изображение из буфера по клику (Clipboard API). */
export async function readImageFileFromClipboard(): Promise<File | null> {
  const clip = navigator.clipboard;
  if (!clip?.read) return null;

  const items = await clip.read();
  for (const item of items) {
    const file = await fileFromClipboardItem(item);
    if (file) return file;
  }
  return null;
}
