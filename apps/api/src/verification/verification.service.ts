import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AppError, badRequest, notFound, unavailable } from '../common/errors';
import { NotificationsService } from '../common/notifications.service';
import { ENV, type Env } from '../config/env';
import { type Database, KYSELY } from '../database/database.module';

const DIDIT = 'https://verification.didit.me/v3';

function mapStatus(s: string | undefined): 'pending' | 'approved' | 'declined' | 'expired' | null {
  switch ((s ?? '').toLowerCase()) {
    case 'approved':
      return 'approved';
    case 'declined':
      return 'declined';
    case 'expired':
    case 'abandoned':
      return 'expired';
    case 'in review':
    case 'in progress':
    case 'not started':
      return 'pending';
    default:
      return null;
  }
}

/**
 * KYC con Didit (sandbox). Se guarda solo el estado, la referencia de sesión y una huella HMAC del
 * documento para impedir cuentas duplicadas. Nunca fotos ni números de documento. Los documentos
 * no se envían a IA ni a buscadores.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger('KYC');

  constructor(
    @Inject(KYSELY) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
  ) {}

  enabled() {
    return Boolean(this.env.DIDIT_API_KEY && this.env.DIDIT_WORKFLOW_ID);
  }

  async start(user: AuthUser) {
    if (!this.enabled()) throw unavailable('kyc_not_configured');
    if (user.kycStatus === 'approved') return { status: 'approved', url: null };
    const res = await fetch(`${DIDIT}/session/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.env.DIDIT_API_KEY! },
      body: JSON.stringify({
        workflow_id: this.env.DIDIT_WORKFLOW_ID,
        vendor_data: user.id,
        callback: `${this.env.APP_PUBLIC_URL}/cuenta?kyc=volver`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      this.logger.warn(`Didit HTTP ${res.status}`);
      throw unavailable('kyc_provider_error');
    }
    const data = (await res.json()) as { session_id?: string; url?: string };
    if (!data.session_id || !data.url) throw unavailable('kyc_provider_error');
    await this.db
      .updateTable('app_users')
      .set({ kyc_session_ref: data.session_id, kyc_status: 'pending' })
      .where('id', '=', user.id)
      .execute();
    return { status: 'pending', url: data.url };
  }

  /** Consulta la decisión (respaldo si el webhook no llegó). */
  async refresh(user: AuthUser) {
    const row = await this.db
      .selectFrom('app_users')
      .select(['kyc_session_ref', 'kyc_status'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    if (!row.kyc_session_ref || !this.enabled()) return { status: row.kyc_status };
    const res = await fetch(`${DIDIT}/session/${encodeURIComponent(row.kyc_session_ref)}/decision/`, {
      headers: { 'x-api-key': this.env.DIDIT_API_KEY! },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { status: row.kyc_status };
    const data = (await res.json()) as Record<string, unknown>;
    await this.apply(user.id, row.kyc_session_ref, data);
    const after = await this.db.selectFrom('app_users').select('kyc_status').where('id', '=', user.id).executeTakeFirstOrThrow();
    return { status: after.kyc_status };
  }

  /** Webhook firmado (X-Signature = HMAC-SHA256 del cuerpo crudo, X-Timestamp ±5 min). */
  async webhook(raw: Buffer | undefined, signature: string | undefined, timestamp: string | undefined) {
    if (!this.env.DIDIT_WEBHOOK_SECRET) throw unavailable('kyc_not_configured');
    if (!raw || !signature || !timestamp) throw new AppError('signature_missing', HttpStatus.UNAUTHORIZED);
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) throw new AppError('stale_timestamp', HttpStatus.UNAUTHORIZED);
    const expected = createHmac('sha256', this.env.DIDIT_WEBHOOK_SECRET).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError('signature_invalid', HttpStatus.UNAUTHORIZED);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw badRequest('body_invalid');
    }
    const userId = typeof body.vendor_data === 'string' ? body.vendor_data : null;
    const sessionId = typeof body.session_id === 'string' ? body.session_id : null;
    if (!userId || !sessionId) return { ok: true };
    const user = await this.db.selectFrom('app_users').select(['id', 'kyc_session_ref']).where('id', '=', userId).executeTakeFirst();
    if (!user || user.kyc_session_ref !== sessionId) return { ok: true };
    await this.apply(user.id, sessionId, body);
    return { ok: true };
  }

  private async apply(userId: string, sessionId: string, data: Record<string, unknown>) {
    const decision = (data.decision ?? data) as Record<string, unknown>;
    const status = mapStatus(String(data.status ?? decision.status ?? ''));
    if (!status) return;
    let fingerprint: string | null = null;
    const idv = (decision.id_verification ?? (Array.isArray(decision.id_verifications) ? decision.id_verifications[0] : null)) as Record<
      string,
      unknown
    > | null;
    if (status === 'approved' && idv && this.env.KYC_HMAC_SECRET) {
      const parts = [idv.issuing_state, idv.document_type, idv.document_number].map((x) =>
        String(x ?? '')
          .trim()
          .toUpperCase(),
      );
      if (parts[2]) fingerprint = createHmac('sha256', this.env.KYC_HMAC_SECRET).update(parts.join('|')).digest('hex');
    }
    if (fingerprint) {
      const dup = await this.db
        .selectFrom('app_users')
        .select('id')
        .where('kyc_fingerprint', '=', fingerprint)
        .where('id', '<>', userId)
        .executeTakeFirst();
      if (dup) {
        await this.db.updateTable('app_users').set({ kyc_status: 'declined' }).where('id', '=', userId).execute();
        return;
      }
    }
    await this.db
      .updateTable('app_users')
      .set({ kyc_status: status, ...(fingerprint ? { kyc_fingerprint: fingerprint } : {}) })
      .where('id', '=', userId)
      .where('kyc_session_ref', '=', sessionId)
      .execute();
    if (status === 'declined' || status === 'expired') {
      await this.notifications.notify({
        userId,
        kind: 'verification_required',
        entityType: 'verification',
        entityId: userId,
        requiresAction: true,
      });
    }
  }

  /** KYB por verificador asignado (rol staff), con alcance y vigencia. */
  async setKyb(orgId: string, status: 'kyb_verified' | 'kyb_rejected' | 'kyb_pending' | 'registered', actorId: string) {
    const r = await this.db
      .updateTable('organizations')
      .set({
        trust: status,
        kyb_verified_at: status === 'kyb_verified' ? new Date() : null,
        kyb_expires_at: status === 'kyb_verified' ? new Date(Date.now() + 365 * 86_400_000) : null,
      })
      .where('id', '=', orgId)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw notFound('supplier');
    await this.notifications.audit(actorId, 'organization', orgId, 'kyb_status', { status });
    return { id: orgId, trust: status };
  }
}
