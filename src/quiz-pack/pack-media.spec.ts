import {
  assertSafeZipPath,
  classifyMediaValue,
  collectReferencedPackRels,
  findQuizJsonEntry,
  isSafePackMediaRel,
  parsePackManifest,
  rewriteLocalMediaToPackPaths,
  rewritePackPathsToUploads,
  uniqueMediaName,
  visitMediaFields,
} from './pack-media';
import type { QuizBuilderPayload } from './pack-types';
import { PACK_FORMAT, PACK_VERSION } from './pack-types';

function sampleQuiz(): QuizBuilderPayload {
  return {
    title: 'Demo',
    description: '',
    background: null,
    finalMusic: null,
    rounds: [
      {
        title: 'R1',
        description: '',
        background: null,
        music: '',
        leaderboardMusic: '',
        questions: [
          {
            text: 'Q?',
            type: 'single',
            timer: 15,
            points: 1,
            media: { image: null, video: '', audio: '' },
            explanation: { text: '', image: null },
            music: '',
            options: [
              { id: 'a', label: 'A', imageUrl: null },
              { id: 'b', label: 'B', imageUrl: null },
            ],
            correct: ['a'],
          },
        ],
      },
    ],
  };
}

describe('pack-media', () => {
  it('rewrites data URL images to media/ files', () => {
    const quiz = sampleQuiz();
    quiz.background = 'data:image/png;base64,AQID';
    quiz.rounds[0].questions[0].options[0].imageUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const { files, missingMedia } = rewriteLocalMediaToPackPaths(quiz, () => 'missing');
    expect(missingMedia).toEqual([]);
    expect(quiz.background).toBe('media/cover.png');
    expect(quiz.rounds[0].questions[0].options[0].imageUrl).toBe('media/r01-q01-opt-01.gif');
    expect(files).toHaveLength(2);
    expect(files[0].source.type).toBe('buffer');
    expect(files[1].source.type).toBe('buffer');
  });

  it('copies upload URLs and rewrites to media/', () => {
    const quiz = sampleQuiz();
    quiz.rounds[0].questions[0].media.audio = '/uploads/audio/abc.mp3';
    const { files, missingMedia } = rewriteLocalMediaToPackPaths(quiz, (kind, fileName) => {
      expect(kind).toBe('audio');
      expect(fileName).toBe('abc.mp3');
      return { absPath: 'C:/tmp/abc.mp3', ext: '.mp3' };
    });
    expect(missingMedia).toEqual([]);
    expect(quiz.rounds[0].questions[0].media.audio).toBe('media/r01-q01-audio.mp3');
    expect(files).toEqual([
      { zipRel: 'media/r01-q01-audio.mp3', source: { type: 'path', absPath: 'C:/tmp/abc.mp3' } },
    ]);
  });

  it('dedupes the same source URL', () => {
    const quiz = sampleQuiz();
    quiz.finalMusic = '/uploads/audio/one.mp3';
    quiz.rounds[0].music = '/uploads/audio/one.mp3';
    const { files } = rewriteLocalMediaToPackPaths(quiz, () => ({
      absPath: '/disk/one.mp3',
      ext: '.mp3',
    }));
    expect(files).toHaveLength(1);
    expect(quiz.finalMusic).toBe(quiz.rounds[0].music);
    expect(quiz.finalMusic).toBe('media/final-music.mp3');
  });

  it('records missing uploads and clears the field', () => {
    const quiz = sampleQuiz();
    quiz.rounds[0].questions[0].media.video = '/uploads/video/gone.mp4';
    const { files, missingMedia } = rewriteLocalMediaToPackPaths(quiz, () => 'missing');
    expect(files).toEqual([]);
    expect(missingMedia).toEqual(['/uploads/video/gone.mp4']);
    expect(quiz.rounds[0].questions[0].media.video).toBe('');
  });

  it('leaves https and gradient values untouched', () => {
    const quiz = sampleQuiz();
    quiz.background = 'gradient:linear-gradient(red, blue)';
    quiz.finalMusic = 'https://cdn.example/a.mp3';
    const { files } = rewriteLocalMediaToPackPaths(quiz, () => 'missing');
    expect(files).toEqual([]);
    expect(quiz.background).toBe('gradient:linear-gradient(red, blue)');
    expect(quiz.finalMusic).toBe('https://cdn.example/a.mp3');
  });

  it('classifies upload, data URL, pack rel, and external', () => {
    expect(classifyMediaValue('').type).toBe('empty');
    expect(classifyMediaValue('/uploads/audio/x.mp3')).toEqual({
      type: 'upload',
      kind: 'audio',
      fileName: 'x.mp3',
    });
    expect(classifyMediaValue('media/cover.png')).toEqual({ type: 'packRel', rel: 'media/cover.png' });
    expect(classifyMediaValue('https://x.test/a.png').type).toBe('external');
    expect(classifyMediaValue('data:image/png;base64,AQID').type).toBe('dataUrl');
  });

  it('rejects unsafe pack-relative media paths', () => {
    expect(() => classifyMediaValue('media/../secret.png')).toThrow(/unsafe media path/);
    expect(isSafePackMediaRel('media/foo.png')).toBe(true);
    expect(isSafePackMediaRel('media/a/b.png')).toBe(false);
  });

  it('rejects zip path traversal', () => {
    expect(() => assertSafeZipPath('../evil.txt')).toThrow(/invalid zip entry path/);
    expect(() => assertSafeZipPath('foo/../../etc/passwd')).toThrow(/invalid zip entry path/);
    expect(() => assertSafeZipPath('/abs/file')).toThrow(/invalid zip entry path/);
    expect(assertSafeZipPath('quiz/media/cover.png')).toBe('quiz/media/cover.png');
  });

  it('finds quiz.json at root or one folder deep', () => {
    expect(findQuizJsonEntry(['quiz.json', 'media/a.png'])).toEqual({
      jsonName: 'quiz.json',
      dirPrefix: '',
    });
    expect(findQuizJsonEntry(['My-Quiz/quiz.json', 'My-Quiz/media/a.png'])).toEqual({
      jsonName: 'My-Quiz/quiz.json',
      dirPrefix: 'My-Quiz/',
    });
    expect(() => findQuizJsonEntry(['media/a.png'])).toThrow(/quiz.json not found/);
    expect(() => findQuizJsonEntry(['a/quiz.json', 'b/quiz.json'])).toThrow(/more than one/);
  });

  it('parses a v1 manifest and rejects other formats', () => {
    const quiz = sampleQuiz();
    const ok = parsePackManifest({
      format: PACK_FORMAT,
      version: PACK_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      quiz,
    });
    expect(ok.quiz.title).toBe('Demo');
    expect(() => parsePackManifest({ format: 'other', version: 1, quiz })).toThrow(/unsupported pack format/);
    expect(() => parsePackManifest({ format: PACK_FORMAT, version: 2, quiz })).toThrow(
      /unsupported pack version/,
    );
  });

  it('keeps imageHideRect on questions through parse', () => {
    const quiz = sampleQuiz();
    quiz.rounds[0].questions[0].imageHideRect = { x: 10, y: 20, w: 30, h: 40 };
    const ok = parsePackManifest({
      format: PACK_FORMAT,
      version: PACK_VERSION,
      quiz,
    });
    expect(ok.quiz.rounds[0].questions[0].imageHideRect).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it('keeps imageHideRects array on questions through parse', () => {
    const quiz = sampleQuiz();
    quiz.rounds[0].questions[0].imageHideRects = [
      { x: 10, y: 20, w: 30, h: 40 },
      { x: 50, y: 10, w: 20, h: 15 },
    ];
    const ok = parsePackManifest({
      format: PACK_FORMAT,
      version: PACK_VERSION,
      quiz,
    });
    expect(ok.quiz.rounds[0].questions[0].imageHideRects).toEqual([
      { x: 10, y: 20, w: 30, h: 40 },
      { x: 50, y: 10, w: 20, h: 15 },
    ]);
  });

  it('rewrites pack paths to upload URLs', () => {
    const quiz = sampleQuiz();
    quiz.background = 'media/cover.png';
    quiz.rounds[0].questions[0].media.audio = 'media/r01-q01-audio.mp3';
    const map = new Map([
      ['media/cover.png', '/uploads/image/aaa.png'],
      ['media/r01-q01-audio.mp3', '/uploads/audio/bbb.mp3'],
    ]);
    rewritePackPathsToUploads(quiz, map);
    expect(quiz.background).toBe('/uploads/image/aaa.png');
    expect(quiz.rounds[0].questions[0].media.audio).toBe('/uploads/audio/bbb.mp3');
  });

  it('collects referenced pack rels', () => {
    const quiz = sampleQuiz();
    quiz.background = 'media/cover.png';
    expect([...collectReferencedPackRels(quiz)]).toEqual(['media/cover.png']);
  });

  it('uniqueMediaName avoids collisions', () => {
    const used = new Set<string>();
    expect(uniqueMediaName(used, 'cover', '.png')).toBe('cover.png');
    expect(uniqueMediaName(used, 'cover', '.png')).toBe('cover-2.png');
  });

  it('visitMediaFields covers matching sides', () => {
    const quiz = sampleQuiz();
    quiz.rounds[0].questions[0].type = 'matching';
    quiz.rounds[0].questions[0].matchLeft = [{ id: 'l1', label: 'L', imageUrl: 'data:image/png;base64,AQID' }];
    quiz.rounds[0].questions[0].matchRight = [{ id: 'r1', label: 'R', imageUrl: null }];
    const visits = visitMediaFields(quiz);
    expect(visits.some((v) => v.suggestedBase === 'r01-q01-match-l-01')).toBe(true);
    const { files } = rewriteLocalMediaToPackPaths(quiz, () => 'missing');
    expect(quiz.rounds[0].questions[0].matchLeft?.[0].imageUrl).toBe('media/r01-q01-match-l-01.png');
    expect(files).toHaveLength(1);
  });
});
