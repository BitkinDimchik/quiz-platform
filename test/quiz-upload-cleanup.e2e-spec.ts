import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

describe('Quiz upload cleanup (e2e)', () => {
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

  function plantUpload(kind: 'audio' | 'video' | 'image', ext: string): { url: string; abs: string } {
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'public', 'uploads', kind);
    mkdirSync(dir, { recursive: true });
    const abs = join(dir, name);
    writeFileSync(abs, Buffer.from(`${kind}-fixture`));
    return { url: `/uploads/${kind}/${name}`, abs };
  }

  async function createPublishedQuiz(
    token: string,
    media: { audioUrl?: string; imageUrl?: string; coverImage?: string; finalMusic?: string },
  ): Promise<string> {
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app.getHttpServer())
      .post('/api/quizzes')
      .set(auth)
      .send({
        title: 'Media quiz',
        coverImage: media.coverImage,
        finalMusic: media.finalMusic,
      })
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
        prompt: 'Q?',
        timeLimitSec: 15,
        basePoints: 1,
        audioUrl: media.audioUrl ?? null,
        imageUrl: media.imageUrl ?? null,
      })
      .expect(201);
    const opt = await request(app.getHttpServer())
      .post('/api/quizzes/options')
      .set(auth)
      .send({ questionId: question.body.questionId, position: 1, label: 'A' })
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
    return quizId;
  }

  it('deletes quiz uploads that no other quiz uses', async () => {
    const token = await register('up-del');
    const audio = plantUpload('audio', '.mp3');
    const image = plantUpload('image', '.jpg');
    const cover = plantUpload('image', '.png');
    const quizId = await createPublishedQuiz(token, {
      audioUrl: audio.url,
      imageUrl: image.url,
      coverImage: cover.url,
    });
    expect(existsSync(audio.abs)).toBe(true);
    expect(existsSync(image.abs)).toBe(true);
    expect(existsSync(cover.abs)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/quizzes/${quizId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(existsSync(audio.abs)).toBe(false);
    expect(existsSync(image.abs)).toBe(false);
    expect(existsSync(cover.abs)).toBe(false);
  });

  it('keeps shared uploads until the last quiz is deleted', async () => {
    const token = await register('up-share');
    const audio = plantUpload('audio', '.mp3');
    const originalId = await createPublishedQuiz(token, { audioUrl: audio.url });
    const cloned = await request(app.getHttpServer())
      .post(`/api/quizzes/${originalId}/clone`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(201);
    const cloneId = cloned.body.quizId as string;
    expect(cloneId).toBeTruthy();
    expect(existsSync(audio.abs)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/quizzes/${originalId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(existsSync(audio.abs)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/quizzes/${cloneId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(existsSync(audio.abs)).toBe(false);
  });

  it('deletes a question upload after the next save no longer references it', async () => {
    const token = await register('up-q');
    const auth = { Authorization: `Bearer ${token}` };
    const audio = plantUpload('audio', '.mp3');
    const quizId = await createPublishedQuiz(token, { audioUrl: audio.url });
    expect(existsSync(audio.abs)).toBe(true);

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
        prompt: 'No media',
        timeLimitSec: 15,
        basePoints: 1,
      })
      .expect(201);
    const opt = await request(app.getHttpServer())
      .post('/api/quizzes/options')
      .set(auth)
      .send({ questionId: question.body.questionId, position: 1, label: 'A' })
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

    expect(existsSync(audio.abs)).toBe(false);
  });

  it('deletes replaced cover image when it is unused', async () => {
    const token = await register('up-cover');
    const cover1 = plantUpload('image', '.jpg');
    const cover2 = plantUpload('image', '.png');
    const quizId = await createPublishedQuiz(token, { coverImage: cover1.url });
    expect(existsSync(cover1.abs)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/quizzes/${quizId}`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ coverImage: cover2.url })
      .expect(200);
    expect(existsSync(cover1.abs)).toBe(false);
    expect(existsSync(cover2.abs)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/quizzes/${quizId}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(existsSync(cover2.abs)).toBe(false);
  });
});
