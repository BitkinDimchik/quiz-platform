import { osClipboardImageToDataUrl, parseOsClipboardImageOutput } from './os-clipboard-image';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('parseOsClipboardImageOutput', () => {
  it('reads mime + base64', () => {
    expect(parseOsClipboardImageOutput(`image/png\n${PNG_B64}`)).toEqual({
      mime: 'image/png',
      base64: PNG_B64,
    });
  });

  it('accepts CRLF and whitespace in base64', () => {
    expect(parseOsClipboardImageOutput(`image/jpeg\r\n${PNG_B64.slice(0, 8)} ${PNG_B64.slice(8)}\r\n`)).toEqual({
      mime: 'image/jpeg',
      base64: PNG_B64,
    });
  });

  it('rejects non-image mime and tiny payloads', () => {
    expect(parseOsClipboardImageOutput('text/plain\nAQIDBAUGBwg=')).toBeNull();
    expect(parseOsClipboardImageOutput('image/png\nab')).toBeNull();
    expect(parseOsClipboardImageOutput('')).toBeNull();
  });

  it('builds a data URL', () => {
    expect(osClipboardImageToDataUrl('image/png', 'AQID')).toBe('data:image/png;base64,AQID');
  });
});
