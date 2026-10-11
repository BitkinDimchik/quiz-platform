import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { ensureLocalDataDirs } from './database/sqlite';
import { htmlRedirect } from './ui/html-redirect.middleware';
import { spaFallback } from './ui/spa-fallback.middleware';

async function bootstrap() {
  ensureLocalDataDirs();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  app.use(htmlRedirect);
  configureApp(app);
  app.use(spaFallback);
  const port = process.env.PORT ?? '3000';
  const host = process.env.LISTEN_HOST ?? '0.0.0.0';
  await app.listen(port, host);
  app.get(Logger).log(`HTTP + WS /game + /metrics on http://${host}:${port}`);
}

bootstrap();
