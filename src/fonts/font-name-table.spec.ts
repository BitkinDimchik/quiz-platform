import { open, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { readFontFamilies } from './font-name-table';

/** Минимальный sfnt с одной таблицей name (nameID 1, платформа Windows, UTF-16BE). */
function buildSfnt(family: string): Buffer {
  const value = Buffer.from(family, 'utf16le');
  value.swap16();

  const nameRecord = Buffer.alloc(12);
  nameRecord.writeUInt16BE(3, 0); // platformID: Windows
  nameRecord.writeUInt16BE(1, 2); // encodingID: UTF-16BE
  nameRecord.writeUInt16BE(0x0409, 4); // languageID: en-US
  nameRecord.writeUInt16BE(1, 6); // nameID: Font Family
  nameRecord.writeUInt16BE(value.length, 8);
  nameRecord.writeUInt16BE(0, 10); // offset внутри пула строк

  const nameHeader = Buffer.alloc(6);
  nameHeader.writeUInt16BE(0, 0); // format
  nameHeader.writeUInt16BE(1, 2); // count
  nameHeader.writeUInt16BE(6 + nameRecord.length, 4); // stringOffset
  const nameTable = Buffer.concat([nameHeader, nameRecord, value]);

  const header = Buffer.alloc(12);
  header.writeUInt32BE(0x00010000, 0); // sfntVersion
  header.writeUInt16BE(1, 4); // numTables

  const directory = Buffer.alloc(16);
  directory.write('name', 0, 'latin1');
  directory.writeUInt32BE(0, 4); // checksum
  directory.writeUInt32BE(header.length + directory.length, 8); // offset таблицы
  directory.writeUInt32BE(nameTable.length, 12);

  return Buffer.concat([header, directory, nameTable]);
}

async function familiesOf(buf: Buffer): Promise<string[]> {
  const path = join(tmpdir(), `font-${randomUUID()}.ttf`);
  await writeFile(path, buf);
  const fh = await open(path, 'r');
  try {
    return await readFontFamilies(fh);
  } finally {
    await fh.close();
    await rm(path, { force: true });
  }
}

describe('readFontFamilies', () => {
  it('reads an ASCII family name', async () => {
    await expect(familiesOf(buildSfnt('Gilroy ExtraBold'))).resolves.toEqual(['Gilroy ExtraBold']);
  });

  it('reads a non-ASCII family name', async () => {
    await expect(familiesOf(buildSfnt('Академия'))).resolves.toEqual(['Академия']);
  });

  it('returns nothing for a file without a name table', async () => {
    const header = Buffer.alloc(12);
    header.writeUInt32BE(0x00010000, 0);
    header.writeUInt16BE(0, 4);
    await expect(familiesOf(header)).resolves.toEqual([]);
  });

  it('returns nothing for a truncated file', async () => {
    await expect(familiesOf(Buffer.alloc(4))).resolves.toEqual([]);
  });
});
