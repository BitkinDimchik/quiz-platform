import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  collectUploadUrlsFromUnknown,
  safeUploadAbsPath,
  unlinkUploadFile,
} from './upload-refs';

describe('upload-refs', () => {
  it('collects direct upload URLs and nested JSON strings', () => {
    const urls = collectUploadUrlsFromUnknown({
      background: '/uploads/image/cover.jpg',
      musicUrl: 'https://cdn.example/a.mp3',
      meta: JSON.stringify({ audio: '/uploads/audio/track.mp3' }),
      options: [{ imageUrl: '/uploads/image/opt.png' }],
      empty: '',
      skip: 'gradient:#fff',
    });
    expect([...urls].sort()).toEqual([
      '/uploads/audio/track.mp3',
      '/uploads/image/cover.jpg',
      '/uploads/image/opt.png',
    ]);
  });

  it('rejects path traversal in upload URLs', () => {
    const root = join(tmpdir(), 'uploads-root');
    expect(safeUploadAbsPath(root, '/uploads/audio/../video/x.mp4')).toBeNull();
    expect(safeUploadAbsPath(root, '/uploads/audio/..\\secret')).toBeNull();
    expect(safeUploadAbsPath(root, '/uploads/image/.gitkeep')).toBeNull();
    const abs = safeUploadAbsPath(root, '/uploads/audio/abc.mp3');
    expect(abs).toBe(join(root, 'audio', 'abc.mp3'));
  });

  it('unlinks an existing upload and ignores missing files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'quiz-uploads-'));
    try {
      const dir = join(root, 'audio');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'gone.mp3');
      writeFileSync(file, 'x');
      expect(existsSync(file)).toBe(true);
      expect(await unlinkUploadFile(root, '/uploads/audio/gone.mp3')).toBe(true);
      expect(existsSync(file)).toBe(false);
      expect(await unlinkUploadFile(root, '/uploads/audio/gone.mp3')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
