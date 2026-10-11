import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Round } from '../entities/round.entity';
import { Question } from '../entities/question.entity';
import { RevisionLayout, RoundLayout } from '../domain/game-navigation';

@Injectable()
export class RevisionLayoutService {
  constructor(
    @InjectRepository(Round)
    private readonly rounds: Repository<Round>,
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
  ) {}

  async loadLayout(revisionId: string): Promise<RevisionLayout> {
    const rounds = await this.rounds.find({
      where: { quizRevisionId: revisionId },
      order: { position: 'ASC' },
    });
    if (rounds.length === 0) return { rounds: [] };

    const roundIds = rounds.map((r) => r.id);
    const qs = await this.questions.find({
      where: { roundId: In(roundIds) },
      order: { roundId: 'ASC', position: 'ASC' },
    });
    const byRound = new Map<string, Question[]>();
    for (const q of qs) {
      const list = byRound.get(q.roundId) ?? [];
      list.push(q);
      byRound.set(q.roundId, list);
    }
    const layouts: RoundLayout[] = rounds.map((round) => ({
      round,
      questionIds: (byRound.get(round.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((q) => q.id),
    }));
    return { rounds: layouts };
  }

  async findRound(revisionId: string, roundId: string): Promise<Round | null> {
    return this.rounds.findOne({ where: { id: roundId, quizRevisionId: revisionId } });
  }
}
