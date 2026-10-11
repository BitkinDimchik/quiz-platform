import { ValidationPipe, ValidationError } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

function flattenMessages(errors: ValidationError[]): string[] {
  const out: string[] = [];
  for (const e of errors) {
    if (e.constraints) out.push(...Object.values(e.constraints));
    if (e.children?.length) out.push(...flattenMessages(e.children));
  }
  return out;
}

export const gameWsValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: (errors: ValidationError[]) =>
    new WsException({
      code: 'VALIDATION',
      message: flattenMessages(errors).join('; ') || 'validation failed',
      details: errors.map((e) => ({
        property: e.property,
        constraints: e.constraints ?? {},
      })),
    }),
});
