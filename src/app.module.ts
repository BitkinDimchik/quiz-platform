import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule, ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MetricsModule } from './observability/metrics.module';
import { QuizModule } from './quiz/quiz.module';
import { SessionModule } from './session/session.module';
import { GameFlowModule } from './game-flow/game-flow.module';
import { AnswerModule } from './answer/answer.module';
import { GameWsModule } from './websocket/game-ws.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchemaVersionService } from './database/schema-version.service';
import { sqliteTypeOrmOptions } from './database/sqlite';
import { ApiKeyGuard } from './common/auth/api-key.guard';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { FontsModule } from './fonts/fonts.module';
import { QuizEditorModule } from './quiz-editor/quiz-editor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot(
      {
        rootPath: join(process.cwd(), 'public', 'uploads'),
        serveRoot: '/uploads',
        serveStaticOptions: { index: false, fallthrough: true },
      },
      {
        rootPath: join(process.cwd(), 'web', 'dist'),
        exclude: ['/api*', '/metrics*', '/socket.io*', '/uploads*', '/health', '/ip'],
        serveStaticOptions: { index: false, fallthrough: true },
      },
    ),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) => {
          const id = req.headers['x-request-id'];
          if (typeof id === 'string' && id.length > 0) return id;
          if (Array.isArray(id) && id[0]) return id[0];
          return randomUUID();
        },
      },
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule, ClsModule],
      inject: [ConfigService, ClsService],
      useFactory: (config: ConfigService, cls: ClsService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          customProps: () => ({
            context: 'HTTP',
            requestId: cls.getId(),
          }),
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
        },
      }),
    }),
    MetricsModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: cfg.get<number>('THROTTLE_DEFAULT_TTL_MS', 60_000),
            limit: cfg.get<number>('THROTTLE_DEFAULT_LIMIT', 100),
          },
          {
            name: 'join',
            ttl: cfg.get<number>('THROTTLE_JOIN_TTL_MS', 60_000),
            limit: cfg.get<number>('THROTTLE_JOIN_LIMIT', 200),
          },
        ],
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        ...sqliteTypeOrmOptions(cfg.get<string>('TYPEORM_LOGGING') === 'true'),
        autoLoadEntities: true,
      }),
    }),
    RealtimeModule,
    AuthModule,
    AdminModule,
    FontsModule,
    QuizEditorModule,
    QuizModule,
    SessionModule,
    GameFlowModule,
    AnswerModule,
    GameWsModule,
  ],
  providers: [
    SchemaVersionService,
    ApiKeyGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
