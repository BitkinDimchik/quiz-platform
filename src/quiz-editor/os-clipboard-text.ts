export const OS_CLIPBOARD_TEXT_MAX = 2048;

/** STA script: Set-Clipboard from UTF-8 base64 (no raw text interpolation). */
export function osClipboardWriteTextScript(text: string): string | null {
  const value = String(text || '').trim();
  if (!value || value.length > OS_CLIPBOARD_TEXT_MAX) return null;
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$bytes = [Convert]::FromBase64String('${b64}')
$text = [Text.Encoding]::UTF8.GetString($bytes)
[System.Windows.Forms.Clipboard]::SetText($text)
`.trim();
}
