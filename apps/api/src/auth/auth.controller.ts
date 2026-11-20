import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Res } from '@nestjs/common';
import { DEFAULT_TIME_ZONE, isValidTimeZone, LOCALES, nextQuotaReset, USER_MODES } from '@jucumari/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../common/errors';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import { AuthService } from './auth.service';
import { type AuthUser, SESSION_COOKIE } from './auth.types';
import { CurrentUser, MaybeUser, Public } from './decorators';

const address = z.string().regex(/^G[A-Z2-7]{55}$/);
const VerifySchema = z.object({
  address,
  nonce: z.string().min(10).max(64),
  signature: z.string().min(40).max(200),
  method: z.enum(['pollar', 'wallet', 'demo']),
  newAccount: z
    .object({
      mode: z.enum(USER_MODES),
      timeZone: z.string().max(64).optional(),
      locale: z.enum(LOCALES).optional(),
      displayName: z.string().trim().max(60).optional(),
    })
    .optional(),
});
const ProfileSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  locale: z.enum(LOCALES).optional(),
  activeMode: z.enum(USER_MODES).optional(),
  enableSupplier: z.literal(true).optional(),
});

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
    @Inject(KYSELY) private readonly db: Database,
  ) {}

  /** Métodos de entrada disponibles (la interfaz los muestra u oculta). */
  @Public()
  @Get('auth/config')
  config() {
    return {
      network: this.env.STELLAR_NETWORK,
      demoMode: this.env.DEMO_MODE,
      methods: {
        pollar: Boolean(this.env.VITE_POLLAR_PUBLISHABLE_KEY),
        wallet: true,
        demoKey: this.auth.demoLoginAllowed(),
      },
    };
  }

  @Public()
  @Post('auth/challenge')
  @HttpCode(200)
  challenge(@Body() body: { address?: unknown }) {
    return this.auth.createChallenge(this.auth.validateAddress(body?.address));
  }

  @Public()
  @Post('auth/verify')
  @HttpCode(200)
  async verify(@Body(new ZodPipe(VerifySchema)) body: z.infer<typeof VerifySchema>, @Res({ passthrough: true }) res: Response) {
    const { token, user, created } = await this.auth.verify(body);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return { user: this.publicUser(user), created };
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Public()
  @Get('me')
  me(@MaybeUser() user: AuthUser | null) {
    return { user: user ? this.publicUser(user) : null };
  }

  @Patch('me')
  async updateProfile(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ProfileSchema)) body: z.infer<typeof ProfileSchema>) {
    const modes = new Set(user.modes);
    if (body.enableSupplier) modes.add('supplier');
    if (body.activeMode && !modes.has(body.activeMode)) throw badRequest('mode_not_enabled');
    const row = await this.db
      .updateTable('app_users')
      .set({
        ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
        modes: [...modes],
        ...(body.activeMode ? { active_mode: body.activeMode } : {}),
      })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { user: this.publicUser(this.auth.toAuthUser(row, user.sessionId)) };
  }

  private publicUser(u: AuthUser) {
    const tz = isValidTimeZone(u.timeZone) ? u.timeZone : DEFAULT_TIME_ZONE;
    return {
      id: u.id,
      address: u.address,
      authMethod: u.authMethod,
      displayName: u.displayName,
      locale: u.locale,
      timeZone: tz,
      modes: u.modes,
      activeMode: u.activeMode,
      staffRoles: u.staffRoles,
      kycStatus: u.kycStatus,
      isDemo: u.isDemo,
      quotaResetsAt: nextQuotaReset(tz).toISOString(),
    };
  }
}
