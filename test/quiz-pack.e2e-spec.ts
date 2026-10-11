import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ZipFile } from 'yazl';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

const TINY_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

describe('Quiz pack export/import (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(prefix: string): Promise<string> {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password1', displayName: prefix })
      .expect(201);
    const token = reg.body.accessToken as string;
    expect(token).toBeTruthy();
    return token;
  }

  async function seedQuizWithMedia(token: string): Promise<{ quizId: string; audioUrl: string }> {
    const auth = { Authorization: `Bearer ${token}` };
    const audioName = `${randomUUID()}.mp3`;
    const audioDir = join(process.cwd(), 'public', 'uploads', 'audio');
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, audioName), Buffer.from('ID3fake-audio'));
    const audioUrl = `/uploads/audio/${audioName}`;

    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(auth)
      .send({ title: 'Pack Quiz', description: 'portable' })
      .expect(201);
    const quizId = created.body.quizId as string;

    const draft = await request(app.getHttpServer())
      .post('/api/quizzes/revisions/draft')
      .set(auth)
      .send({ quizId })
      .expect(201);
    const quizRevisionId = draft.body.quizRevisionId as string;

    const round = await request(app.getHttpServer())
      .post('/api/quizzes/rounds')
      .set(auth)
      .send({ quizRevisionId, position: 1, title: 'R1' })
      .expect(201);

    const question = await request(app.getHttpServer())
      .post('/api/quizzes/questions')
      .set(auth)
      .send({
        roundId: round.body.roundId,
        position: 1,
        type: 'single_choice',
        prompt: 'Who?',
        timeLimitSec: 15,
        basePoints: 1,
        audioUrl,
        explanationImageUrl: TINY_GIF,
        meta: { imageHideRect: { x: 10, y: 20, w: 30, h: 40 } },
      })
      .expect(201);

    const opt = await request(app.getHttpServer())
      .post('/api/quizzes/options')
      .set(auth)
      .send({
        questionId: question.body.questionId,
        position: 1,
        label: 'A',
        imageUrl: TINY_GIF,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/quizzes/correct-option')
      .set(auth)
      .send({ questionId: question.body.questionId, optionId: opt.body.optionId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/quizzes/revisions/publish')
      .set(auth)
      .send({ quizRevisionId })
      .expect(201);

    return { quizId, audioUrl };
  }

  function zipFromEntries(entries: { name: string; data: Buffer | string }[]): Promise<Buffer> {
    const zipfile = new ZipFile();
    for (const e of entries) {
      zipfile.addBuffer(Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8'), e.name);
    }
    zipfile.end();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      zipfile.outputStream.on('data', (c: Buffer) => chunks.push(c));
      zipfile.outputStream.on('error', reject);
      zipfile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  it('owner can export a pack and another user can import it with remapped media', async () => {
    const tokenA = await register('pack-a');
    const tokenB = await register('pack-b');
    const { quizId, audioUrl } = await seedQuizWithMedia(tokenA);
    const authA = { Authorization: `Bearer ${tokenA}` };
    const authB = { Authorization: `Bearer ${tokenB}` };

    const exported = await request(app.getHttpServer())
      .get(`/api/quizzes/${quizId}/export`)
      .set(authA)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
        res.on('error', cb);
      })
      .expect(200);

    expect(exported.headers['content-type']).toMatch(/zip/);
    expect(exported.headers['content-disposition']).toMatch(/\.quizpack\.zip/);
    const zipBuf = exported.body as Buffer;
    expect(zipBuf.length).toBeGreaterThan(40);

    await request(app.getHttpServer()).get(`/api/quizzes/${quizId}/export`).set(authB).expect(403);

    const imported = await request(app.getHttpServer())
      .post('/api/quizzes/import')
      .set(authB)
      .attach('file', zipBuf, { filename: 'quiz.quizpack.zip', contentType: 'application/zip' })
      .expect(201);

    const newId = imported.body.quizId as string;
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(quizId);

    const got = await request(app.getHttpServer()).get(`/api/quizzes/${newId}`).set(authB).expect(200);
    expect(got.body.title).toBe('Pack Quiz');
    const q0 = got.body.rounds[0].questions[0];
    expect(q0.text).toBe('Who?');
    expect(q0.media.audio).toMatch(/^\/uploads\/audio\//);
    expect(q0.media.audio).not.toBe(audioUrl);
    expect(q0.explanation.image).toMatch(/^\/uploads\/image\//);
    expect(q0.options[0].imageUrl).toMatch(/^\/uploads\/image\//);
    expect(q0.imageHideRect).toEqual({ x: 10, y: 20, w: 30, h: 40 });

    await request(app.getHttpServer()).get(q0.explanation.image).expect(200);
    await request(app.getHttpServer()).get(q0.media.audio).expect(200);
    await request(app.getHttpServer()).get(`/api/quizzes/${quizId}`).set(authB).expect(403);
  });

    it('rejects a zip without quiz.json', async () => {
    const token = await register('pack-bad');
    const auth = { Authorization: `Bearer ${token}` };

    const emptyZip = await zipFromEntries([{ name: 'readme.txt', data: 'nope' }]);
    await request(app.getHttpServer())
      .post('/api/quizzes/import')
      .set(auth)
      .attach('file', emptyZip, { filename: 'bad.quizpack.zip', contentType: 'application/zip' })
      .expect(400);
  });
});
