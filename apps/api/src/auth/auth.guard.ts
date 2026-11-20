import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@jucumari/shared';
import type { Request } from 'express';
import { AppError } from '../common/errors';
import { AuthService } from './auth.service';
import { SESSION_COOKIE } from './auth.types';
import { IS_PUBLIC, STAFF_ROLES_KEY } from './decorators';

/** Guard global: toda ruta requiere sesión salvo @Public(). Las de staff exigen el rol. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const user = token ? await this.auth.resolveToken(token) : null;
    if (user) req.user = user;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    if (!user) throw new AppError('unauthenticated', HttpStatus.UNAUTHORIZED);

    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(STAFF_ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.some((r) => user.staffRoles.includes(r))) throw new AppError('forbidden_role', HttpStatus.FORBIDDEN);
    return true;
  }
}
