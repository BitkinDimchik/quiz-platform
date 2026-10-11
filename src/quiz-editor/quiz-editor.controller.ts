import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { AdminService } from '../admin/services/admin.service';
import { QuizPackService } from '../quiz-pack/quiz-pack.service';
import { DomainError } from '../common/domain-error';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateDraftRevisionDto } from '../admin/dto/create-draft-revision.dto';
import { CreateOptionDto } from '../admin/dto/create-option.dto';
import { CreateQuestionDto } from '../admin/dto/create-question.dto';
import { CreateRoundDto } from '../admin/dto/create-round.dto';
import { PublishRevisionDto } from '../admin/dto/publish-revision.dto';
import { SetCorrectOptionDto } from '../admin/dto/set-correct-option.dto';
import { SetCorrectTextDto } from '../admin/dto/set-correct-text.dto';
import { UpdateQuizDto } from '../admin/dto/update-quiz.dto';
import { UpdateStageLayoutDto } from '../admin/dto/update-stage-layout.dto';
import { EditorCreateQuizDto } from './dto/editor-create-quiz.dto';
import { OsClipboardImageService } from './os-clipboard-image.service';
import { ClipboardTextDto } from './dto/clipboard-text.dto';

@Controller('api/quizzes')
@UseGuards(JwtAuthGuard)
@SkipThrottle({ default: true, join: true })
export class QuizEditorController {
  constructor(
    private readonly admin: AdminService,
    private readonly pack: QuizPackService,
    private readonly osClipboard: OsClipboardImageService,
  ) {}

  @Post('upload/audio')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'public', 'uploads', 'audio');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const rawExt = extname(file.originalname || '').toLowerCase();
          const ext = rawExt && rawExt.length <= 10 ? rawExt : '.mp3';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = typeof file.mimetype === 'string' && file.mimetype.startsWith('audio/');
        cb(ok ? null : new Error('Only audio files are allowed'), ok);
      },
    }),
  )
  async uploadAudio(@UploadedFile() file: { filename: string } | undefined): Promise<{ url: string }> {
    // Served by ServeStaticModule from /public
    const name = file?.filename || '';
    return { url: `/uploads/audio/${name}` };
  }

  @Post('upload/video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'public', 'uploads', 'video');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const rawExt = extname(file.originalname || '').toLowerCase();
          const ext = rawExt && rawExt.length <= 10 ? rawExt : '.mp4';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 120 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const mt = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase() : '';
        const name = (file.originalname || '').toLowerCase();
        const okExt = /\.(mp4|webm|mov|mkv|ogv|m4v)$/i.test(name);
        const okMime = mt.startsWith('video/') || mt === 'application/mp4' || mt === 'application/octet-stream';
        const ok = okMime || okExt;
        cb(ok ? null : new Error('Only video files are allowed'), ok);
      },
    }),
  )
  async uploadVideo(@UploadedFile() file: { filename: string } | undefined): Promise<{ url: string }> {
    const name = file?.filename || '';
    return { url: `/uploads/video/${name}` };
  }

  @Post('clipboard-image')
  async clipboardImage(): Promise<{ dataUrl: string | null }> {
    const dataUrl = await this.osClipboard.readDataUrl();
    return { dataUrl };
  }

  @Post('clipboard-text')
  async clipboardText(@Body() body: ClipboardTextDto): Promise<{ ok: boolean }> {
    const ok = await this.osClipboard.writeText(body.text);
    return { ok };
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(tmpdir(), 'quiz-pack-uploads');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, _file, cb) => {
          cb(null, `${randomUUID()}.zip`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const mt = (file.mimetype || '').toLowerCase();
        const okExt = name.endsWith('.zip');
        const okMime =
          mt === 'application/zip' ||
          mt === 'application/x-zip-compressed' ||
          mt === 'application/octet-stream' ||
          mt === '';
        cb(okExt || okMime ? null : new Error('Only zip files are allowed'), okExt || okMime);
      },
    }),
  )
  async importPack(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: { path?: string } | undefined,
  ): Promise<{ quizId: string }> {
    const zipPath = file?.path || '';
    if (!zipPath) throw DomainError.validation('zip file required');
    try {
      return await this.pack.importQuizPack(userId, zipPath);
    } finally {
      await unlink(zipPath).catch(() => undefined);
    }
  }

  @Get('browse')
  @Header('Cache-Control', 'no-store')
  async browse() {
    const quizzes = await this.admin.listQuizzesForBrowse();
    return { quizzes };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentUser('sub') userId: string) {
    const quizzes = await this.admin.listQuizzes(userId);
    return { quizzes };
  }

  @Post()
  async create(@CurrentUser('sub') userId: string, @Body() body: EditorCreateQuizDto) {
    const q = await this.admin.createQuiz({
      ownerUserId: userId,
      title: body.title,
      description: body.description ?? null,
      coverImage: body.coverImage,
      finalMusic: body.finalMusic,
      fontFamily: body.fontFamily,
      stageTypeStyles: body.stageTypeStyles,
    });
    return { quizId: q.id };
  }

  @Post('revisions/draft')
  async draftRevision(@CurrentUser('sub') userId: string, @Body() body: CreateDraftRevisionDto) {
    await this.admin.assertQuizOwned(body.quizId, userId);
    const r = await this.admin.createDraftRevision(body.quizId);
    return { quizRevisionId: r.id, revisionNo: r.revisionNo };
  }

  @Post('revisions/publish')
  async publishRevision(@CurrentUser('sub') userId: string, @Body() body: PublishRevisionDto) {
    await this.admin.assertRevisionOwned(body.quizRevisionId, userId);
    await this.admin.publishRevision(body.quizRevisionId);
    return { ok: true };
  }

  @Post('rounds')
  async createRound(@CurrentUser('sub') userId: string, @Body() body: CreateRoundDto) {
    await this.admin.assertRevisionOwned(body.quizRevisionId, userId);
    const r = await this.admin.createRound(body);
    return { roundId: r.id };
  }

  @Post('questions')
  async createQuestion(@CurrentUser('sub') userId: string, @Body() body: CreateQuestionDto) {
    await this.admin.assertRoundOwned(body.roundId, userId);
    const q = await this.admin.createQuestion(body);
    return { questionId: q.id };
  }

  @Patch('questions/:questionId/stage-layout')
  async patchStageLayout(
    @CurrentUser('sub') userId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: UpdateStageLayoutDto,
  ) {
    const stageLayout = await this.admin.patchQuestionStageLayout(questionId, userId, body.stageLayout);
    return { ok: true, stageLayout };
  }

  @Patch('rounds/:roundId/stage-layout')
  async patchRoundStageLayout(
    @CurrentUser('sub') userId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() body: UpdateStageLayoutDto,
  ) {
    const stageLayout = await this.admin.patchRoundStageLayout(roundId, userId, body.stageLayout);
    return { ok: true, stageLayout };
  }

  @Patch(':quizId/stage-layout')
  async patchQuizStageLayout(
    @CurrentUser('sub') userId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() body: UpdateStageLayoutDto,
  ) {
    const stageLayout = await this.admin.patchQuizStageLayout(quizId, userId, body.stageLayout);
    return { ok: true, stageLayout };
  }

  @Post('options')
  async createOption(@CurrentUser('sub') userId: string, @Body() body: CreateOptionDto) {
    await this.admin.assertQuestionOwned(body.questionId, userId);
    const o = await this.admin.createOption(body);
    return { optionId: o.id };
  }

  @Post('correct-option')
  async setCorrectOption(@CurrentUser('sub') userId: string, @Body() body: SetCorrectOptionDto) {
    await this.admin.assertQuestionOwned(body.questionId, userId);
    const a = await this.admin.setCorrectOption(body);
    return { answerId: a.id };
  }

  @Post('correct-text')
  async setCorrectText(@CurrentUser('sub') userId: string, @Body() body: SetCorrectTextDto) {
    await this.admin.assertQuestionOwned(body.questionId, userId);
    const a = await this.admin.setCorrectText(body);
    return { answerId: a.id };
  }

  @Post(':quizId/clone')
  async clone(
    @CurrentUser('sub') userId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<{ quizId: string }> {
    return this.admin.cloneQuiz(quizId, userId);
  }

  @Get(':quizId/export')
  @Header('Cache-Control', 'no-store')
  async exportPack(
    @CurrentUser('sub') userId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<StreamableFile> {
    await this.admin.assertQuizOwned(quizId, userId);
    return this.pack.exportQuizPack(quizId);
  }

  @Get(':quizId')
  async getOne(@CurrentUser('sub') userId: string, @Param('quizId', ParseUUIDPipe) quizId: string) {
    await this.admin.assertQuizOwned(quizId, userId);
    return this.admin.getQuizBuilderPayload(quizId);
  }

  @Patch(':quizId')
  async patch(
    @CurrentUser('sub') userId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
    @Body() body: UpdateQuizDto,
  ) {
    await this.admin.assertQuizOwned(quizId, userId);
    await this.admin.updateQuiz(quizId, body);
    return { ok: true };
  }

  @Delete(':quizId')
  async remove(@CurrentUser('sub') userId: string, @Param('quizId', ParseUUIDPipe) quizId: string) {
    await this.admin.assertQuizOwned(quizId, userId);
    await this.admin.deleteQuiz(quizId);
    return { ok: true };
  }
}
