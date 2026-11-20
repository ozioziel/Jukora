import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { StaffRole } from '@jucumari/shared';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Ruta accesible sin sesión (Home, Explorar, salud…). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const STAFF_ROLES_KEY = 'staffRoles';
/** Ruta restringida a un rol asignado por script (árbitro, verificador…). */
export const StaffOnly = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});

/** Usuario opcional en rutas públicas. */
export const MaybeUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  return (ctx.switchToHttp().getRequest().user as AuthUser | undefined) ?? null;
});
