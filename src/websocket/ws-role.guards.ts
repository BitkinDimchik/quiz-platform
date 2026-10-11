import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { requireHost, requirePlayer, requireSessionMember } from './ws-role.util';

/** Участник сессии (host или player), handshake уже прошёл. */
@Injectable()
export class WsSessionMemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireSessionMember(context.switchToWs().getClient<Socket>());
    return true;
  }
}

@Injectable()
export class WsHostGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireHost(context.switchToWs().getClient<Socket>());
    return true;
  }
}

@Injectable()
export class WsPlayerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requirePlayer(context.switchToWs().getClient<Socket>());
    return true;
  }
}
