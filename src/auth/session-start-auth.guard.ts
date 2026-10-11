import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtUserPayload } from './auth.service';

@Injectable()
export class SessionStartAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtUserPayload }>();
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        req.user = this.jwt.verify<JwtUserPayload>(auth.slice(7));
        return true;
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    }

    const expected = this.config.get<string>('QUIZ_SESSION_API_KEY');
    if (!expected?.length) throw new ServiceUnavailableException('QUIZ_SESSION_API_KEY is not configured');
    const rawHeader = req.headers['x-api-key'];
    const key = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (key !== expected) throw new UnauthorizedException('Invalid or missing API key');
    return true;
  }
}
