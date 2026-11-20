import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_TIME_ZONE, isValidTimeZone, type Locale, type StaffRole, type UserMode } from '@jucumari/shared';
import { jwtVerify, SignJWT } from 'jose';
import { AppError, badRequest } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';
import type { AuthUser } from './auth.types';
import { verifySep53 } from './sep53';

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

export interface VerifyInput {
  address: string;
  nonce: string;
  signature: string;
  method: 'pollar' | 'wallet' | 'demo';
  newAccount?: { mode: UserMode; timeZone?: string; locale?: Locale; displayName?: string };
}

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.key = new TextEncoder().encode(env.SESSION_SECRET);
  }

  demoLoginAllowed(): boolean {
    return this.env.DEMO_MODE && this.env.STELLAR_NETWORK === 'testnet';
  }

  async createChallenge(address: string): Promise<{ nonce: string; message: string; expiresAt: string }> {
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const host = new URL(this.env.APP_PUBLIC_URL).host;
    const message = [
      `${host} quiere que inicies sesión con tu cuenta Stellar.`,
      `Cuenta: ${address}`,
      `Red: ${this.env.STELLAR_NETWORK}`,
      `Nonce: ${nonce}`,
      `Emitido: ${new Date().toISOString()}`,
      'Firmar este mensaje no mueve fondos ni autoriza pagos.',
    ].join('\n');
    await this.db.deleteFrom('auth_challenges').where('expires_at', '<', new Date()).execute();
    await this.db.insertInto('auth_challenges').values({ nonce, stellar_address: address, message, expires_at: expiresAt }).execute();
    return { nonce, message, expiresAt: expiresAt.toISOString() };
  }

  async verify(input: VerifyInput): Promise<{ token: string; user: AuthUser; created: boolean }> {
    if (input.method === 'demo' && !this.demoLoginAllowed()) throw new AppError('demo_login_disabled', HttpStatus.FORBIDDEN);

    // Consumo atómico del desafío: un nonce solo sirve una vez.
    const challenge = await this.db
      .updateTable('auth_challenges')
      .set({ used_at: new Date() })
      .where('nonce', '=', input.nonce)
      .where('stellar_address', '=', input.address)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returning(['message'])
      .executeTakeFirst();
    if (!challenge) throw new AppError('challenge_invalid', HttpStatus.UNAUTHORIZED);
    if (!verifySep53(input.address, challenge.message, input.signature)) throw new AppError('signature_invalid', HttpStatus.UNAUTHORIZED);

    let row = await this.db.selectFrom('app_users').selectAll().where('stellar_address', '=', input.address).executeTakeFirst();
    let created = false;
    if (!row) {
      const n = input.newAccount;
      const mode: UserMode = n?.mode ?? 'buyer';
      const tz = n?.timeZone && isValidTimeZone(n.timeZone) ? n.timeZone : DEFAULT_TIME_ZONE;
      row = await this.db
        .insertInto('app_users')
        .values({
          stellar_address: input.address,
          auth_method: input.method,
          display_name: (n?.displayName ?? '').slice(0, 60),
          locale: n?.locale ?? 'es',
          time_zone: tz,
          modes: mode === 'supplier' ? ['buyer', 'supplier'] : ['buyer'],
          active_mode: mode,
          is_demo: input.method === 'demo',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      created = true;
    }

    const session = await this.db
      .insertInto('auth_sessions')
      .values({ user_id: row.id, expires_at: new Date(Date.now() + SESSION_TTL_MS) })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const token = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(row.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + SESSION_TTL_MS) / 1000))
      .sign(this.key);
    await this.db
      .insertInto('audit_events')
      .values({
        actor_id: row.id,
        entity_type: 'session',
        entity_id: session.id,
        action: created ? 'signup' : 'login',
        data: { method: input.method },
      })
      .execute();
    return { token, user: this.toAuthUser(row, session.id), created };
  }

  async resolveToken(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      const sid = typeof payload.sid === 'string' ? payload.sid : null;
      if (!sid || !payload.sub) return null;
      const row = await this.db
        .selectFrom('auth_sessions as s')
        .innerJoin('app_users as u', 'u.id', 's.user_id')
        .selectAll('u')
        .where('s.id', '=', sid)
        .where('s.user_id', '=', payload.sub)
        .where('s.revoked_at', 'is', null)
        .where('s.expires_at', '>', new Date())
        .executeTakeFirst();
      return row ? this.toAuthUser(row, sid) : null;
    } catch {
      return null;
    }
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.updateTable('auth_sessions').set({ revoked_at: new Date() }).where('id', '=', sessionId).execute();
  }

  validateAddress(address: unknown): string {
    if (typeof address !== 'string' || !/^G[A-Z2-7]{55}$/.test(address)) throw badRequest('address_invalid');
    return address;
  }

  toAuthUser(
    row: {
      id: string;
      stellar_address: string;
      auth_method: string;
      display_name: string;
      locale: string;
      time_zone: string;
      modes: string[];
      active_mode: string;
      staff_roles: string[];
      kyc_status: string;
      is_demo: boolean;
    },
    sessionId: string,
  ): AuthUser {
    return {
      id: row.id,
      address: row.stellar_address,
      authMethod: row.auth_method as AuthUser['authMethod'],
      displayName: row.display_name,
      locale: row.locale as Locale,
      timeZone: row.time_zone,
      modes: row.modes as UserMode[],
      activeMode: row.active_mode as UserMode,
      staffRoles: row.staff_roles as StaffRole[],
      kycStatus: row.kyc_status,
      isDemo: row.is_demo,
      sessionId,
    };
  }
}
