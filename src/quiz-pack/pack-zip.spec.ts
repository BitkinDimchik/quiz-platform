import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { crc32 } from 'zlib';
import { ZipFile } from 'yazl';
import { extractZipEntriesToDir, listZipEntryNames, readZipEntryBuffer } from './pack-zip';
import { PACK_FORMAT, PACK_VERSION } from './pack-types';

async function bufferFromZip(zipfile: ZipFile): Promise<Buffer> {
  zipfile.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zipfile.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zipfile.outputStream.on('error', reject);
    zipfile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Uncompressed ZIP that does not sanitize `..` in entry names (yazl refuses them). */
function makeStoredZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localFull = Buffer.concat([local, nameBuf, data]);
    locals.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, eocd]);
}

describe('pack-zip', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pack-zip-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists and extracts quiz.json plus media from a yazl zip', async () => {
    const zipfile = new ZipFile();
    const manifest = {
      format: PACK_FORMAT,
      version: PACK_VERSION,
      quiz: { title: 'Z', description: '', background: 'media/cover.png', finalMusic: null, rounds: [] },
    };
    zipfile.addBuffer(Buffer.from(JSON.stringify(manifest), 'utf8'), 'Z/quiz.json');
    zipfile.addBuffer(Buffer.from([1, 2, 3]), 'Z/media/cover.png');
    const buf = await bufferFromZip(zipfile);
    const zipPath = join(dir, 'p.zip');
    await writeFile(zipPath, buf);

    const names = await listZipEntryNames(zipPath);
    expect(names).toEqual(expect.arrayContaining(['Z/quiz.json', 'Z/media/cover.png']));
    const jsonBuf = await readZipEntryBuffer(zipPath, 'Z/quiz.json', 1_000_000);
    expect(JSON.parse(jsonBuf.toString('utf8')).quiz.title).toBe('Z');

    const out = join(dir, 'out');
    await extractZipEntriesToDir(zipPath, out, new Set(names));
    const png = await readFile(join(out, 'Z', 'media', 'cover.png'));
    expect([...png]).toEqual([1, 2, 3]);
  });

  it('rejects zip entry names with path traversal before extract', async () => {
    const json = Buffer.from(
      JSON.stringify({
        format: PACK_FORMAT,
        version: PACK_VERSION,
        quiz: { title: 'x', description: '', background: null, finalMusic: null, rounds: [] },
      }),
    );
    const buf = makeStoredZip([
      { name: 'quiz.json', data: json },
      { name: '../evil.txt', data: Buffer.from('hack') },
    ]);
    const zipPath = join(dir, 'evil.zip');
    await writeFile(zipPath, buf);
    await expect(listZipEntryNames(zipPath)).rejects.toThrow(/invalid zip entry path/);
  });
});
