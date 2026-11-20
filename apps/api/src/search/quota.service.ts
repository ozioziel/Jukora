import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DAILY_SMART_SEARCHES, nextQuotaReset, quotaDayKey } from '@jucumari/shared';
import { sql } from 'kysely';
import { AppError } from '../common/errors';
import { type Database, KYSELY } from '../database/database.module';

/**
 * Diez búsquedas inteligentes confirmadas por día y cuenta. Reserva atómica en la base;
 * se consume cuando hubo ejecución útil y se devuelve si falló por causas técnicas.
 */
@Injectable()
export class QuotaService {
  constructor(@Inject(KYSELY) private readonly db: Database) {}

  async status(userId: string, timeZone: string) {
    const day = quotaDayKey(timeZone);
    const row = await this.db
      .selectFrom('quota_ledger')
      .select(sql<number>`count(*)::int`.as('used'))
      .where('user_id', '=', userId)
      .where('day_key', '=', day)
      .where('status', '<>', 'refunded')
      .executeTakeFirst();
    const used = row?.used ?? 0;
    return {
      limit: DAILY_SMART_SEARCHES,
      used,
      remaining: Math.max(0, DAILY_SMART_SEARCHES - used),
      resetsAt: nextQuotaReset(timeZone).toISOString(),
      timeZone,
    };
  }

  async reserve(userId: string, timeZone: string, idempotencyKey: string): Promise<{ ledgerId: string; created: boolean }> {
    const day = quotaDayKey(timeZone);
    try {
      const { rows } = await sql<{ ledger_id: string; created: boolean; used: number }>`
        select * from public.reserve_search_quota(${userId}::uuid, ${day}, ${idempotencyKey}, ${DAILY_SMART_SEARCHES})`.execute(this.db);
      const r = rows[0]!;
      return { ledgerId: r.ledger_id, created: r.created };
    } catch (e) {
      if (e instanceof Error && e.message.includes('quota_exhausted')) {
        throw new AppError('quota_exhausted', HttpStatus.TOO_MANY_REQUESTS, 'quota_exhausted', {
          resetsAt: nextQuotaReset(timeZone).toISOString(),
        });
      }
      throw e;
    }
  }

  async attachRun(ledgerId: string, runId: string) {
    await this.db.updateTable('quota_ledger').set({ run_id: runId, updated_at: new Date() }).where('id', '=', ledgerId).execute();
  }

  async consumeForRun(runId: string) {
    await this.db
      .updateTable('quota_ledger')
      .set({ status: 'consumed', updated_at: new Date() })
      .where('run_id', '=', runId)
      .where('status', '=', 'reserved')
      .execute();
  }

  async refundForRun(runId: string) {
    await this.db
      .updateTable('quota_ledger')
      .set({ status: 'refunded', updated_at: new Date() })
      .where('run_id', '=', runId)
      .where('status', '=', 'reserved')
      .execute();
  }
}
