import { DataSource } from 'typeorm';
import { User } from '../../src/entities/user.entity';
import { Quiz } from '../../src/entities/quiz.entity';
import { QuizRevision } from '../../src/entities/quiz-revision.entity';
import { Round } from '../../src/entities/round.entity';
import { Question } from '../../src/entities/question.entity';
import { QuestionOption } from '../../src/entities/question-option.entity';
import { QuestionAnswer } from '../../src/entities/question-answer.entity';
import { QuestionType } from '../../src/common/enums';

/** Минимальный опубликованный квиз для E2E. */
export async function seedPublishedQuiz(
  ds: DataSource,
  opts: {
    questionCount?: number;
    explanationText?: string | null;
    explanationImageUrl?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    stageLayout?: Record<string, unknown>;
    bettingEnabled?: boolean;
    bettingMaxFraction?: string | null;
    /** Настройки ставки раунда: bettingMode / bettingMinStake / bettingMaxStake / bettingPresets. */
    roundMeta?: Record<string, unknown>;
    questionBettingEnabled?: boolean;
    questionBettingMaxFraction?: string | null;
    /** Доп. meta первого вопроса (в т.ч. настройки ставки). */
    questionMeta?: Record<string, unknown>;
  } = {},
): Promise<{ quizId: string }> {
  const userRepo = ds.getRepository(User);
  const quizRepo = ds.getRepository(Quiz);
  const revRepo = ds.getRepository(QuizRevision);
  const roundRepo = ds.getRepository(Round);
  const qRepo = ds.getRepository(Question);
  const optRepo = ds.getRepository(QuestionOption);
  const ansRepo = ds.getRepository(QuestionAnswer);

  const user = await userRepo.save(
    userRepo.create({
      email: `e2e-${Date.now()}@test.local`,
      passwordHash: 'x',
      displayName: 'E2E',
    }),
  );

  const quiz = await quizRepo.save(
    quizRepo.create({
      ownerUserId: user.id,
      title: 'E2E Quiz',
      slug: null,
      description: null,
    }),
  );

  const rev = await revRepo.save(
    revRepo.create({
      quizId: quiz.id,
      revisionNo: 1,
      title: null,
      publishedAt: new Date(),
    }),
  );

  const round = await roundRepo.save(
    roundRepo.create({
      quizRevisionId: rev.id,
      position: 0,
      title: 'R1',
      showLeaderboardAfter: false,
      bettingEnabled: opts.bettingEnabled ?? false,
      bettingMaxFraction: opts.bettingMaxFraction ?? null,
      meta: opts.roundMeta ?? {},
    }),
  );

  const questionCount = opts.questionCount ?? 1;
  for (let i = 0; i < questionCount; i += 1) {
    const question = await qRepo.save(
      qRepo.create({
        roundId: round.id,
        position: i,
        type: QuestionType.SingleChoice,
        prompt: i === 0 ? '2+2?' : `Вопрос ${i + 1}`,
        imageUrl: null,
        audioUrl: i === 0 ? (opts.audioUrl ?? null) : null,
        videoUrl: i === 0 ? (opts.videoUrl ?? null) : null,
        timeLimitSec: 60,
        basePoints: 10,
        textGradingMode: null,
        meta: (() => {
          const meta: Record<string, unknown> = {};
          if (i === 0 && opts.stageLayout) meta.stageLayout = opts.stageLayout;
          if (i === 0 && opts.questionBettingEnabled) {
            meta.bettingEnabled = true;
            if (opts.questionBettingMaxFraction) {
              meta.bettingMaxFraction = opts.questionBettingMaxFraction;
            }
          }
          if (i === 0 && opts.questionMeta) Object.assign(meta, opts.questionMeta);
          return Object.keys(meta).length ? meta : {};
        })(),
        explanationText: i === 0 ? (opts.explanationText ?? null) : null,
        explanationImageUrl: i === 0 ? (opts.explanationImageUrl ?? null) : null,
      }),
    );

    const optCorrect = await optRepo.save(
      optRepo.create({
        questionId: question.id,
        position: 0,
        label: '4',
      }),
    );
    await optRepo.save(
      optRepo.create({
        questionId: question.id,
        position: 1,
        label: '5',
      }),
    );

    await ansRepo.save(
      ansRepo.create({
        questionId: question.id,
        optionId: optCorrect.id,
        correctText: null,
        isCaseSensitive: false,
      }),
    );
  }

  return { quizId: quiz.id };
}
