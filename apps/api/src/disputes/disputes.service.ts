import { Inject, Injectable } from '@nestjs/common';
import { type DisputeReason, toUnits } from '@jucumari/shared';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { type Database, KYSELY } from '../database/database.module';
import { EscrowService } from '../escrow/escrow.service';
import { StorageService } from '../uploads/storage.service';

const EVIDENCE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4'];

/**
 * Disputas: las partes aportan pruebas privadas; decide un árbitro humano independiente con rol
 * asignado. La IA nunca decide. La resolución se ejecuta en el escrow y solo se marca resuelta
 * con confirmación de la red.
 */
@Injectable()
export class DisputesService {
  constructor(
    @Inject(KYSELY) private readonly db: Database,
    private readonly access: AccessService,
    private readonly escrow: EscrowService,
    private readonly storage: StorageService,
  ) {}

  async open(user: AuthUser, orderId: string, input: { reason: DisputeReason; narrative: string; claimedAmount?: string }) {
    const { role, order } = await this.access.orderRole(user, orderId);
    if (role === 'arbiter') throw forbidden('only_parties');
    if (input.claimedAmount && toUnits(input.claimedAmount) > toUnits(order.amount)) throw badRequest('claim_exceeds_amount');
    const existing = await this.db.selectFrom('disputes').select(['id', 'status']).where('order_id', '=', orderId).executeTakeFirst();
    if (existing && existing.status !== 'draft') throw conflict('dispute_exists');
    const d = existing
      ? existing
      : await this.db
          .insertInto('disputes')
          .values({
            order_id: orderId,
            opened_by: user.id,
            reason: input.reason,
            narrative: input.narrative,
            claimed_amount: input.claimedAmount ?? null,
            status: 'draft',
          })
          .returning(['id', 'status'])
          .executeTakeFirstOrThrow();
    // Queda en borrador: se abre (y se avisa a la otra parte y a los árbitros) cuando la red confirma.
    const tx = await this.escrow.prepare(user, orderId, 'dispute');
    return { disputeId: d.id, tx };
  }

  async detail(user: AuthUser, disputeId: string) {
    const d = await this.db.selectFrom('disputes').selectAll().where('id', '=', disputeId).executeTakeFirst();
    if (!d) throw notFound('dispute');
    const { role, order } = await this.access.orderRole(user, d.order_id);
    const evidence = await this.db
      .selectFrom('evidence')
      .select(['id', 'uploaded_by', 'mime', 'size_bytes', 'sha256', 'note', 'is_synthetic', 'created_at'])
      .where('dispute_id', '=', disputeId)
      .orderBy('created_at')
      .execute();
    return {
      id: d.id,
      role,
      orderId: d.order_id,
      orderTitle: order.title,
      amount: order.amount,
      currency: order.currency,
      reason: d.reason,
      narrative: d.narrative,
      claimedAmount: d.claimed_amount,
      status: d.status,
      evidenceDeadline: d.evidence_deadline,
      decision: d.decision,
      openedByBuyer: d.opened_by === order.buyer_id,
      evidence: evidence.map((e) => ({ ...e, mine: e.uploaded_by === user.id, fromBuyer: e.uploaded_by === order.buyer_id })),
      escrow: await this.escrow.forOrder(d.order_id),
    };
  }

  async addEvidence(user: AuthUser, disputeId: string, file: { buffer: Buffer } | undefined, note: string, synthetic: boolean) {
    if (!file) throw badRequest('file_required');
    const d = await this.db.selectFrom('disputes').select(['id', 'order_id', 'status']).where('id', '=', disputeId).executeTakeFirst();
    if (!d) throw notFound('dispute');
    const { role } = await this.access.orderRole(user, d.order_id);
    if (role === 'arbiter') throw forbidden('only_parties');
    if (!['open', 'collecting_evidence', 'review'].includes(d.status)) throw conflict('evidence_closed');
    const up = await this.storage.upload('evidence', `orders/${d.order_id}`, file.buffer, EVIDENCE_MIME, 10 * 1024 * 1024);
    const e = await this.db
      .insertInto('evidence')
      .values({
        order_id: d.order_id,
        dispute_id: d.id,
        uploaded_by: user.id,
        storage_path: up.path,
        sha256: up.sha256,
        mime: up.mime,
        size_bytes: up.size,
        note: note.slice(0, 500),
        is_synthetic: synthetic,
      })
      .returning(['id', 'sha256'])
      .executeTakeFirstOrThrow();
    return e;
  }

  async evidenceUrl(user: AuthUser, evidenceId: string) {
    const e = await this.db.selectFrom('evidence').select(['order_id', 'storage_path']).where('id', '=', evidenceId).executeTakeFirst();
    if (!e) throw notFound('evidence');
    await this.access.orderRole(user, e.order_id);
    return { url: await this.storage.signedUrl('evidence', e.storage_path, 120), expiresIn: 120 };
  }

  // ───────────── Árbitro ─────────────
  async cases(user: AuthUser) {
    return this.db
      .selectFrom('disputes as d')
      .innerJoin('orders as o', 'o.id', 'd.order_id')
      .select(['d.id', 'd.status', 'd.reason', 'd.created_at', 'd.arbiter_id', 'o.title', 'o.amount', 'o.currency', 'o.is_demo'])
      .where((eb) => eb.or([eb('d.arbiter_id', '=', user.id), eb('d.arbiter_id', 'is', null)]))
      .where('d.status', '<>', 'draft')
      .orderBy('d.created_at', 'desc')
      .execute();
  }

  async claim(user: AuthUser, disputeId: string) {
    const r = await this.db
      .updateTable('disputes')
      .set({ arbiter_id: user.id, status: 'review' })
      .where('id', '=', disputeId)
      .where('arbiter_id', 'is', null)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw conflict('case_already_assigned');
    return { ok: true };
  }

  async decide(user: AuthUser, disputeId: string, input: { buyer: string; supplier: string; rationale: string }) {
    const d = await this.db.selectFrom('disputes').selectAll().where('id', '=', disputeId).executeTakeFirst();
    if (!d) throw notFound('dispute');
    if (d.arbiter_id !== user.id) throw forbidden('not_assigned_arbiter');
    const tx = await this.escrow.prepare(user, d.order_id, 'resolve', { distributions: { buyer: input.buyer, supplier: input.supplier } });
    await this.db
      .updateTable('disputes')
      .set({
        status: 'execution_pending',
        decision: JSON.stringify({
          buyer: input.buyer,
          supplier: input.supplier,
          rationale: input.rationale,
          decidedAt: new Date().toISOString(),
        }),
      })
      .where('id', '=', disputeId)
      .execute();
    return { tx };
  }
}
