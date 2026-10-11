import { describe, expect, it } from 'vitest';
import { sanitizeNext } from './next-url';
import { htmlPathToCanonical } from './html-redirects';

describe('sanitizeNext', () => {
  it('allows relative paths', () => {
    expect(sanitizeNext('/builder?quizId=1')).toBe('/builder?quizId=1');
  });
  it('rejects protocol-relative', () => {
    expect(sanitizeNext('//evil.test')).toBe('/quizzes');
  });
  it('rejects absolute urls', () => {
    expect(sanitizeNext('https://evil.test/')).toBe('/quizzes');
  });
  it('rejects backslash after slash', () => {
    expect(sanitizeNext('/\\evil')).toBe('/quizzes');
  });
});

describe('htmlPathToCanonical', () => {
  it('maps player.html with query', () => {
    expect(htmlPathToCanonical('/player.html', '?code=ABCD5')).toBe('/player?code=ABCD5');
  });
  it('maps connect.html', () => {
    expect(htmlPathToCanonical('/connect.html')).toBe('/connect');
  });
  it('maps index.html', () => {
    expect(htmlPathToCanonical('/index.html')).toBe('/');
  });
});
