import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Quiz } from '../entities/quiz.entity';
import { QuizRevision } from '../entities/quiz-revision.entity';
import { Round } from '../entities/round.entity';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import { QuestionAnswer } from '../entities/question-answer.entity';
import { DomainError } from '../common/domain-error';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizzes: Repository<Quiz>,
    @InjectRepository(QuizRevision)
    private readonly revisions: Repository<QuizRevision>,
    @InjectRepository(Round)
    private readonly rounds: Repository<Round>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly options: Repository<QuestionOption>,
    @InjectRepository(QuestionAnswer)
    private readonly answers: Repository<QuestionAnswer>,
  ) {}

  async createQuiz(
    ownerUserId: string,
    title: string,
    slug?: string | null,
    description?: string | null,
    meta?: Record<string, unknown> | null,
  ): Promise<Quiz> {
    const q = this.quizzes.create({
      ownerUserId,
      title,
      slug: slug ?? null,
      description: description ?? null,
      meta: meta && Object.keys(meta).length > 0 ? meta : {},
    });
    return this.quizzes.save(q);
  }

  async updateQuiz(
    quizId: string,
    patch: { title?: string; description?: string | null; meta?: Record<string, unknown> | null },
  ): Promise<Quiz> {
    const q = await this.quizzes.findOne({ where: { id: quizId } });
    if (!q) throw DomainError.notFound('quiz');
    if (patch.title != null) q.title = patch.title;
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      const d = patch.description;
      q.description = d == null || !String(d).trim() ? null : String(d).trim();
    }
    if (patch.meta !== undefined && patch.meta !== null) {
      const next = { ...(q.meta || {}), ...patch.meta };
      for (const k of Object.keys(next)) {
        if (next[k] === null) delete next[k];
      }
      q.meta = next;
    }
    return this.quizzes.save(q);
  }

  async createDraftRevision(quizId: string): Promise<QuizRevision> {
    const row = await this.revisions
      .createQueryBuilder('r')
      .select('MAX(r.revisionNo)', 'max')
      .where('r.quizId = :quizId', { quizId })
      .getRawOne<{ max: string | null }>();
    const maxNo = row?.max != null ? parseInt(row.max, 10) : 0;
    const rev = this.revisions.create({
      quizId,
      revisionNo: maxNo + 1,
      title: null,
      publishedAt: null,
    });
    return this.revisions.save(rev);
  }

  async publishRevision(revisionId: string): Promise<void> {
    const r = await this.revisions.findOne({ where: { id: revisionId } });
    if (!r) throw DomainError.notFound('quiz_revision');
    r.publishedAt = new Date();
    await this.revisions.save(r);
  }

  async saveRound(round: Partial<Round>): Promise<Round> {
    const entity = this.rounds.create(round as Round);
    return this.rounds.save(entity);
  }

  async saveQuestion(q: Partial<Question>): Promise<Question> {
    const entity = this.questions.create(q as Question);
    return this.questions.save(entity);
  }

  async saveOption(o: Partial<QuestionOption>): Promise<QuestionOption> {
    const entity = this.options.create(o as QuestionOption);
    return this.options.save(entity);
  }

  async saveAnswerRow(row: Partial<QuestionAnswer>): Promise<QuestionAnswer> {
    const entity = this.answers.create(row as QuestionAnswer);
    return this.answers.save(entity);
  }

  async getPublishedRevision(quizId: string): Promise<QuizRevision | null> {
    return this.revisions.findOne({
      where: { quizId, publishedAt: Not(IsNull()) },
      order: { revisionNo: 'DESC' },
    });
  }

  /** Опубликованная ревизия по id (для POST /session/:id/run с точным revision). */
  async getPublishedRevisionByRevisionId(revisionId: string): Promise<QuizRevision | null> {
    return this.revisions.findOne({
      where: { id: revisionId, publishedAt: Not(IsNull()) },
    });
  }

  async findQuizById(quizId: string): Promise<Quiz | null> {
    return this.quizzes.findOne({ where: { id: quizId } });
  }
}
