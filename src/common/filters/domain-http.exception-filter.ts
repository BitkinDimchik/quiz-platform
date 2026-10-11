import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain-error';

function statusForDomain(code: DomainError['code']): number {
  switch (code) {
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'CONFLICT':
      return HttpStatus.CONFLICT;
    case 'VALIDATION':
      return HttpStatus.BAD_REQUEST;
    case 'UNAUTHORIZED':
      return HttpStatus.UNAUTHORIZED;
    case 'FORBIDDEN':
      return HttpStatus.FORBIDDEN;
    case 'ILLEGAL_STATE':
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

@Catch()
export class DomainHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      const status = statusForDomain(exception.code);
      res.status(status).json({
        error: {
          code: exception.code,
          message: exception.message,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST && exception instanceof BadRequestException) {
        const payload =
          typeof body === 'string'
            ? { message: body }
            : (body as Record<string, unknown>);
        res.status(status).json({
          error: {
            code: 'VALIDATION',
            message: Array.isArray(payload.message)
              ? (payload.message as string[]).join('; ')
              : String(payload.message ?? 'validation failed'),
            details: payload.message,
          },
        });
        return;
      }
      const message =
        typeof body === 'string'
          ? body
          : (body as { message?: string }).message ?? exception.message;
      res.status(status).json({
        error: {
          code: 'HTTP',
          message: String(message),
        },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error',
      },
    });
  }
}
