import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    const raw = req.headers.authorization;
    if (!raw?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = raw.slice(7);
    try {
      req.user = this.auth.validateAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
