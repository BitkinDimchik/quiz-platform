import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUserPayload } from './auth.service';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUserPayload | undefined, ctx: ExecutionContext): string | JwtUserPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtUserPayload }>();
    const u = req.user;
    if (!u) return undefined;
    if (data) return u[data] as string;
    return u;
  },
);
