import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { API_KEY_KIND, ApiKeyKind } from './api-key.constants';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<ApiKeyKind | undefined>(API_KEY_KIND, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (kind == null) {
      return true;
    }

    const envName = kind === 'internal' ? 'QUIZ_INTERNAL_API_KEY' : 'QUIZ_SESSION_API_KEY';
    const expected = this.config.get<string>(envName);
    if (!expected?.length) {
      throw new ServiceUnavailableException(`${envName} is not configured`);
    }

    const req = context.switchToHttp().getRequest<Request>();
    const rawHeader = req.headers['x-api-key'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const auth = req.headers.authorization;
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;

    const provided = header ?? bearer;
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
