import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository, In } from 'typeorm';
import { AdvanceMode, SessionPhase } from '../common/enums';
import { GameSession } from '../entities/game-session.entity';
import { GameFlowService } from './game-flow.service';

/**
 * Автопрогресс для режима automatic:
 * когда истекает phaseDeadlineAt в фазе question — перейти к следующему вопросу.
 *
 * MVP: без отдельной фазы reveal/leaderboard на таймере.
 */
@Injectable()
export class AutomaticAdvanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomaticAdvanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(GameSession)
    private readonly sessions: Repository<GameSession>,
    private readonly flow: GameFlowService,
  ) {}

  onModuleInit(): void {
    const intervalMs = parseInt(process.env.AUTO_ADVANCE_TICK_MS ?? '500', 10);
    this.timer = setInterval(() => void this.tick(), Math.max(200, intervalMs));
    this.timer.unref?.();
    this.logger.log(`auto-advance tick every ${Math.max(200, intervalMs)}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.sessions.find({
        where: {
          endedAt: IsNull(),
          advanceMode: AdvanceMode.Automatic,
          isPaused: false,
          phase: In([
            SessionPhase.QuizIntro,
            SessionPhase.RoundIntro,
            SessionPhase.QuestionRead,
            SessionPhase.Question,
            SessionPhase.AnswerReveal,
            SessionPhase.RoundReplay,
            SessionPhase.RoundSummary,
            SessionPhase.Leaderboard,
          ]),
          phaseDeadlineAt: LessThan(now),
        },
        take: 50,
        order: { phaseDeadlineAt: 'ASC' },
      });
      if (!due.length) return;
      for (const s of due) {
        try {
          await this.flow.advanceAfterDeadline(s.id);
        } catch (e) {
          // не шумим в логах: может быть гонка/уже продвинули
          this.logger.debug(
            { sessionId: s.id, err: e instanceof Error ? e.message : String(e) },
            'auto-advance failed',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

