import { osClipboardWriteTextScript } from './os-clipboard-text';

describe('osClipboardWriteTextScript', () => {
  it('embeds only base64 of the payload', () => {
    const url = 'http://192.168.0.155:3000/player?code=HYBLX';
    const script = osClipboardWriteTextScript(url);
    expect(script).toBeTruthy();
    const b64 = Buffer.from(url, 'utf8').toString('base64');
    expect(script).toContain(b64);
    expect(script).not.toContain(url);
    expect(script).toContain('Clipboard]::SetText');
  });

  it('rejects empty and oversized text', () => {
    expect(osClipboardWriteTextScript('  ')).toBeNull();
    expect(osClipboardWriteTextScript('x'.repeat(2049))).toBeNull();
  });
});
