import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { corsOriginFromEnv } from '../config/cors.util';
import { DomainHttpExceptionFilter } from '../common/filters/domain-http.exception-filter';

export function configureApp(app: INestApplication): void {
  const bodyLimit = process.env.HTTP_BODY_LIMIT ?? '32mb';
  (app as NestExpressApplication).useBodyParser('json', { limit: bodyLimit });
  (app as NestExpressApplication).useBodyParser('urlencoded', { extended: true, limit: bodyLimit });

  app.useGlobalFilters(new DomainHttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
    }),
  );
  const origin = corsOriginFromEnv();
  app.enableCors({
    origin,
    credentials: true,
  });
}
