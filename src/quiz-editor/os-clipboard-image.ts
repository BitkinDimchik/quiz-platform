/** Разбор stdout скрипта чтения буфера Windows (первая строка — MIME, дальше base64). */
export function parseOsClipboardImageOutput(raw: string): { mime: string; base64: string } | null {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  const nl = text.search(/\r?\n/);
  if (nl < 0) return null;
  const mime = text.slice(0, nl).trim().toLowerCase();
  const base64 = text.slice(nl + 1).replace(/\s/g, '');
  if (!mime.startsWith('image/') || base64.length < 16) return null;
  if (!/^[a-z0-9+.-]+\/[a-z0-9+.-]+$/i.test(mime)) return null;
  if (!/^[a-z0-9+/]+=*$/i.test(base64)) return null;
  return { mime, base64 };
}

export function osClipboardImageToDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}
