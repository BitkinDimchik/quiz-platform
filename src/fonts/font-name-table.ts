import type { FileHandle } from 'fs/promises';

const TAG_TTCF = 0x74746366; // 'ttcf' — коллекция шрифтов
const NAME_ID_FAMILY = 1;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const PLATFORM_MAC = 1;
const PLATFORM_WINDOWS = 3;
const MAX_NAME_TABLE_BYTES = 512 * 1024;
const MAX_TABLES = 512;
const MAX_FONTS_IN_COLLECTION = 64;

/** Расширения, у которых есть таблица name. */
export const FONT_FILE_EXTENSIONS = ['.ttf', '.otf', '.ttc', '.otc'];

async function readAt(fh: FileHandle, length: number, position: number): Promise<Buffer | null> {
  if (length <= 0) return null;
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  if (bytesRead < length) return null;
  return buf;
}

function decodeNameValue(buf: Buffer, platformId: number): string {
  if (platformId === PLATFORM_WINDOWS) {
    // UTF-16BE: Node умеет только utf16le, поэтому меняем порядок байт.
    const swapped = Buffer.from(buf);
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (platformId === PLATFORM_MAC) return buf.toString('latin1');
  return buf.toString('utf8');
}

function pickBestFamily(
  candidates: Array<{ platformId: number; nameId: number; value: string }>,
): string | null {
  const clean = candidates
    .map((c) => ({ ...c, value: c.value.replace(/\0/g, '').trim() }))
    .filter((c) => c.value.length > 0 && c.value.length <= 120);
  if (!clean.length) return null;

  const score = (c: { platformId: number; nameId: number }) => {
    let s = 0;
    if (c.nameId === NAME_ID_TYPOGRAPHIC_FAMILY) s += 2;
    if (c.platformId === PLATFORM_WINDOWS) s += 1;
    return s;
  };
  return clean.sort((a, b) => score(b) - score(a))[0].value;
}

/** Разобрать таблицу name одного шрифта внутри файла (base — смещение sfnt). */
async function readSfntFamily(fh: FileHandle, base: number): Promise<string | null> {
  const header = await readAt(fh, 12, base);
  if (!header) return null;
  const numTables = header.readUInt16BE(4);
  if (numTables <= 0 || numTables > MAX_TABLES) return null;

  const directory = await readAt(fh, numTables * 16, base + 12);
  if (!directory) return null;

  let nameOffset = 0;
  let nameLength = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = i * 16;
    if (directory.toString('latin1', rec, rec + 4) === 'name') {
      nameOffset = directory.readUInt32BE(rec + 8);
      nameLength = directory.readUInt32BE(rec + 12);
      break;
    }
  }
  if (!nameLength) return null;

  const table = await readAt(fh, Math.min(nameLength, MAX_NAME_TABLE_BYTES), nameOffset);
  if (!table || table.length < 6) return null;

  const count = table.readUInt16BE(2);
  const stringOffset = table.readUInt16BE(4);
  const candidates: Array<{ platformId: number; nameId: number; value: string }> = [];

  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > table.length) break;
    const platformId = table.readUInt16BE(rec);
    const nameId = table.readUInt16BE(rec + 6);
    if (nameId !== NAME_ID_FAMILY && nameId !== NAME_ID_TYPOGRAPHIC_FAMILY) continue;

    const length = table.readUInt16BE(rec + 8);
    const offset = table.readUInt16BE(rec + 10);
    const start = stringOffset + offset;
    if (start + length > table.length) continue;

    candidates.push({
      platformId,
      nameId,
      value: decodeNameValue(table.subarray(start, start + length), platformId),
    });
  }

  return pickBestFamily(candidates);
}

/** Имена семейств из файла шрифта (у коллекций .ttc их несколько). */
export async function readFontFamilies(fh: FileHandle): Promise<string[]> {
  const head = await readAt(fh, 12, 0);
  if (!head) return [];

  if (head.readUInt32BE(0) === TAG_TTCF) {
    const numFonts = Math.min(head.readUInt32BE(8), MAX_FONTS_IN_COLLECTION);
    const offsets = await readAt(fh, numFonts * 4, 12);
    if (!offsets) return [];
    const families: string[] = [];
    for (let i = 0; i < numFonts; i++) {
      const family = await readSfntFamily(fh, offsets.readUInt32BE(i * 4));
      if (family) families.push(family);
    }
    return families;
  }

  const family = await readSfntFamily(fh, 0);
  return family ? [family] : [];
}
