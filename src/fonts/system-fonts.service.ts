import { Injectable, Logger } from '@nestjs/common';
import { open, readdir } from 'fs/promises';
import { homedir } from 'os';
import { extname, join } from 'path';
import { FONT_FILE_EXTENSIONS, readFontFamilies } from './font-name-table';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DEPTH = 3;
const MAX_FILES = 4000;
const READ_CONCURRENCY = 16;

type CacheEntry = { families: string[]; at: number };

@Injectable()
export class SystemFontsService {
  private readonly logger = new Logger(SystemFontsService.name);
  private cache: CacheEntry | null = null;
  private inFlight: Promise<string[]> | null = null;

  /** Каталоги шрифтов ОС, включая пользовательские (туда ставятся нестандартные шрифты). */
  private fontDirectories(): string[] {
    const home = homedir();
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
      const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
      return [
        join(systemRoot, 'Fonts'),
        join(localAppData, 'Microsoft', 'Windows', 'Fonts'),
      ];
    }
    if (process.platform === 'darwin') {
      return ['/System/Library/Fonts', '/Library/Fonts', join(home, 'Library', 'Fonts')];
    }
    return [
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      join(home, '.fonts'),
      join(home, '.local', 'share', 'fonts'),
    ];
  }

  private async collectFontFiles(dir: string, depth: number, out: string[]): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.collectFontFiles(full, depth + 1, out);
      } else if (FONT_FILE_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }

  private async familiesFromFile(path: string): Promise<string[]> {
    let fh;
    try {
      fh = await open(path, 'r');
    } catch {
      return [];
    }
    try {
      return await readFontFamilies(fh);
    } catch {
      return [];
    } finally {
      await fh.close().catch(() => undefined);
    }
  }

  private async scan(): Promise<string[]> {
    const files: string[] = [];
    for (const dir of this.fontDirectories()) {
      await this.collectFontFiles(dir, 0, files);
    }

    const families = new Set<string>();
    for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
      const batch = files.slice(i, i + READ_CONCURRENCY);
      const results = await Promise.all(batch.map((f) => this.familiesFromFile(f)));
      for (const list of results) {
        for (const family of list) families.add(family);
      }
    }

    const sorted = [...families].sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
    this.logger.log(`system fonts: ${sorted.length} families from ${files.length} files`);
    return sorted;
  }

  async listFamilies(options?: { refresh?: boolean }): Promise<string[]> {
    if (options?.refresh) {
      this.cache = null;
      this.inFlight = null;
    }
    const fresh = this.cache && Date.now() - this.cache.at < CACHE_TTL_MS;
    if (fresh) return this.cache!.families;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.scan()
      .then((families) => {
        this.cache = { families, at: Date.now() };
        return families;
      })
      .catch((e: Error) => {
        this.logger.warn(`system fonts scan failed: ${e?.message || e}`);
        return [] as string[];
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
